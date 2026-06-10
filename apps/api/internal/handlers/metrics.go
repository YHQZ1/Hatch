package handlers

import (
	"context"
	"database/sql"
	"fmt"
	"math"
	"net/http"
	"sort"
	"strings"
	"time"

	dbpkg "github.com/YHQZ1/hatch/packages/db/gen"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/cloudwatch"
	cwtypes "github.com/aws/aws-sdk-go-v2/service/cloudwatch/types"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type MetricsHandler struct {
	queries        *dbpkg.Queries
	cloudwatch     *cloudwatch.Client
	awsRegion      string
	ecsClusterName string
	albDimension   string
}

type metricPoint struct {
	Label    string  `json:"label"`
	Requests float64 `json:"requests"`
	Errors   float64 `json:"errors"`
	Latency  float64 `json:"latency"`
	CPU      float64 `json:"cpu"`
	Memory   float64 `json:"memory"`
}

type metricSummary struct {
	Requests  float64 `json:"requests"`
	ErrorRate float64 `json:"errorRate"`
	Latency   float64 `json:"latency"`
	CPU       float64 `json:"cpu"`
	Memory    float64 `json:"memory"`
}

type projectMetricsResponse struct {
	Source    string        `json:"source"`
	Available bool          `json:"available"`
	Reason    string        `json:"reason,omitempty"`
	Points    []metricPoint `json:"points"`
	Summary   metricSummary `json:"summary"`
}

func NewMetricsHandler(db *sql.DB, awsRegion, ecsClusterName, albListenerARN, albARN string) *MetricsHandler {
	if awsRegion == "" {
		awsRegion = "ap-south-1"
	}

	cfg, err := config.LoadDefaultConfig(context.Background(), config.WithRegion(awsRegion))
	if err != nil {
		cfg = aws.Config{Region: awsRegion}
	}

	return &MetricsHandler{
		queries:        dbpkg.New(db),
		cloudwatch:     cloudwatch.NewFromConfig(cfg),
		awsRegion:      awsRegion,
		ecsClusterName: ecsClusterName,
		albDimension:   loadBalancerDimension(albARN, albListenerARN),
	}
}

func (h *MetricsHandler) GetProjectMetrics(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	projectID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	if _, err := h.queries.GetProjectByIDAndUserID(c.Request.Context(), dbpkg.GetProjectByIDAndUserIDParams{
		ID:     projectID,
		UserID: userID,
	}); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}

	deployments, err := h.queries.GetDeploymentsByProjectIDAndUserID(c.Request.Context(), dbpkg.GetDeploymentsByProjectIDAndUserIDParams{
		ProjectID: projectID,
		UserID:    userID,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch deployments"})
		return
	}

	deployment, ok := latestObservableDeployment(deployments)
	if !ok {
		c.JSON(http.StatusOK, projectMetricsResponse{
			Source:    "cloudwatch",
			Available: false,
			Reason:    "No live deployment with CloudWatch resource metadata yet. Trigger a fresh deployment after running migrations.",
			Points:    []metricPoint{},
		})
		return
	}

	if h.ecsClusterName == "" {
		c.JSON(http.StatusOK, projectMetricsResponse{
			Source:    "cloudwatch",
			Available: false,
			Reason:    "ECS_CLUSTER_NAME is not configured on the API service.",
			Points:    []metricPoint{},
		})
		return
	}

	points, err := h.fetchProjectMetrics(c.Request.Context(), deployment, parseMetricRange(c.Query("range")))
	if err != nil {
		c.JSON(http.StatusOK, projectMetricsResponse{
			Source:    "cloudwatch",
			Available: false,
			Reason:    fmt.Sprintf("CloudWatch metrics unavailable: %v", err),
			Points:    []metricPoint{},
		})
		return
	}

	c.JSON(http.StatusOK, projectMetricsResponse{
		Source:    "cloudwatch",
		Available: len(points) > 0,
		Points:    points,
		Summary:   summarizeMetricPoints(points),
	})
}

func (h *MetricsHandler) fetchProjectMetrics(ctx context.Context, deployment dbpkg.Deployment, rangeValue string) ([]metricPoint, error) {
	start, end, period := metricWindow(rangeValue)
	ctx, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()

	serviceName := deployment.EcsServiceName.String
	targetGroup := targetGroupDimension(deployment.TargetGroupArn.String)
	queries := []cwtypes.MetricDataQuery{
		metricQuery("cpu", "AWS/ECS", "CPUUtilization", "Average", period, []cwtypes.Dimension{
			{Name: aws.String("ClusterName"), Value: aws.String(h.ecsClusterName)},
			{Name: aws.String("ServiceName"), Value: aws.String(serviceName)},
		}),
		metricQuery("memory", "AWS/ECS", "MemoryUtilization", "Average", period, []cwtypes.Dimension{
			{Name: aws.String("ClusterName"), Value: aws.String(h.ecsClusterName)},
			{Name: aws.String("ServiceName"), Value: aws.String(serviceName)},
		}),
	}

	if h.albDimension != "" && targetGroup != "" {
		albDims := []cwtypes.Dimension{
			{Name: aws.String("LoadBalancer"), Value: aws.String(h.albDimension)},
			{Name: aws.String("TargetGroup"), Value: aws.String(targetGroup)},
		}
		queries = append(queries,
			metricQuery("requests", "AWS/ApplicationELB", "RequestCount", "Sum", period, albDims),
			metricQuery("latency", "AWS/ApplicationELB", "TargetResponseTime", "Average", period, albDims),
			metricQuery("target4xx", "AWS/ApplicationELB", "HTTPCode_Target_4XX_Count", "Sum", period, albDims),
			metricQuery("target5xx", "AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", "Sum", period, albDims),
		)
	}

	out, err := h.cloudwatch.GetMetricData(ctx, &cloudwatch.GetMetricDataInput{
		StartTime:         aws.Time(start),
		EndTime:           aws.Time(end),
		MetricDataQueries: queries,
		ScanBy:            cwtypes.ScanByTimestampAscending,
	})
	if err != nil {
		return nil, err
	}

	series := map[string]map[int64]float64{}
	for _, result := range out.MetricDataResults {
		if result.Id == nil {
			continue
		}
		values := map[int64]float64{}
		for i, timestamp := range result.Timestamps {
			if i >= len(result.Values) {
				continue
			}
			bucket := timestamp.Truncate(time.Duration(period) * time.Second).Unix()
			values[bucket] = result.Values[i]
		}
		series[*result.Id] = values
	}

	return hydrateMetricPoints(start, end, period, rangeValue, series), nil
}

func metricQuery(id, namespace, metricName, stat string, period int32, dims []cwtypes.Dimension) cwtypes.MetricDataQuery {
	return cwtypes.MetricDataQuery{
		Id:         aws.String(id),
		ReturnData: aws.Bool(true),
		MetricStat: &cwtypes.MetricStat{
			Period: aws.Int32(period),
			Stat:   aws.String(stat),
			Metric: &cwtypes.Metric{
				Namespace:  aws.String(namespace),
				MetricName: aws.String(metricName),
				Dimensions: dims,
			},
		},
	}
}

func hydrateMetricPoints(start, end time.Time, period int32, rangeValue string, series map[string]map[int64]float64) []metricPoint {
	points := []metricPoint{}
	step := time.Duration(period) * time.Second
	for bucketTime := start.Truncate(step); !bucketTime.After(end); bucketTime = bucketTime.Add(step) {
		key := bucketTime.Unix()
		requests := valueAt(series, "requests", key)
		errorCount := valueAt(series, "target4xx", key) + valueAt(series, "target5xx", key)
		errorRate := 0.0
		if requests > 0 {
			errorRate = (errorCount / requests) * 100
		}
		latency := valueAt(series, "latency", key) * 1000

		points = append(points, metricPoint{
			Label:    metricLabel(bucketTime, rangeValue),
			Requests: math.Round(requests),
			Errors:   roundTwo(errorRate),
			Latency:  roundTwo(latency),
			CPU:      roundTwo(valueAt(series, "cpu", key)),
			Memory:   roundTwo(valueAt(series, "memory", key)),
		})
	}

	return points
}

func valueAt(series map[string]map[int64]float64, name string, bucket int64) float64 {
	values, ok := series[name]
	if !ok {
		return 0
	}
	return values[bucket]
}

func summarizeMetricPoints(points []metricPoint) metricSummary {
	if len(points) == 0 {
		return metricSummary{}
	}
	var summary metricSummary
	for _, point := range points {
		summary.Requests += point.Requests
		summary.ErrorRate += point.Errors
		summary.Latency += point.Latency
		summary.CPU += point.CPU
		summary.Memory += point.Memory
	}

	count := float64(len(points))
	return metricSummary{
		Requests:  summary.Requests,
		ErrorRate: roundTwo(summary.ErrorRate / count),
		Latency:   roundTwo(summary.Latency / count),
		CPU:       roundTwo(summary.CPU / count),
		Memory:    roundTwo(summary.Memory / count),
	}
}

func latestObservableDeployment(deployments []dbpkg.Deployment) (dbpkg.Deployment, bool) {
	sort.SliceStable(deployments, func(i, j int) bool {
		return deployments[i].CreatedAt.After(deployments[j].CreatedAt)
	})
	for _, deployment := range deployments {
		if deployment.EcsServiceName.Valid && deployment.TargetGroupArn.Valid {
			return deployment, true
		}
	}
	return dbpkg.Deployment{}, false
}

func parseMetricRange(value string) string {
	switch value {
	case "7d", "30d":
		return value
	default:
		return "24h"
	}
}

func metricWindow(rangeValue string) (time.Time, time.Time, int32) {
	end := time.Now().UTC()
	switch rangeValue {
	case "7d":
		return end.AddDate(0, 0, -7), end, 12 * 60 * 60
	case "30d":
		return end.AddDate(0, 0, -30), end, 24 * 60 * 60
	default:
		return end.Add(-24 * time.Hour), end, 60 * 60
	}
}

func metricLabel(t time.Time, rangeValue string) string {
	switch rangeValue {
	case "7d":
		return t.Format("Mon 15:04")
	case "30d":
		return t.Format("Jan 2")
	default:
		return t.Format("15:04")
	}
}

func loadBalancerDimension(albARN, listenerARN string) string {
	if dim := arnSuffixAfter(albARN, ":loadbalancer/"); dim != "" {
		return dim
	}
	if dim := arnSuffixAfter(listenerARN, ":listener/"); dim != "" {
		parts := strings.Split(dim, "/")
		if len(parts) >= 3 {
			return strings.Join(parts[:3], "/")
		}
	}
	return ""
}

func targetGroupDimension(targetGroupARN string) string {
	if suffix := arnSuffixAfter(targetGroupARN, ":targetgroup/"); suffix != "" {
		return "targetgroup/" + suffix
	}
	return ""
}

func arnSuffixAfter(value, marker string) string {
	index := strings.Index(value, marker)
	if index < 0 {
		return ""
	}
	return value[index+len(marker):]
}

func roundTwo(value float64) float64 {
	return math.Round(value*100) / 100
}
