package handlers

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

type Repo struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	FullName    string `json:"full_name"`
	Private     bool   `json:"private"`
	HTMLURL     string `json:"html_url"`
	Description string `json:"description"`
	Language    string `json:"language"`
	UpdatedAt   string `json:"updated_at"`
}

type GitHubHandler struct {
	rdb *redis.Client
}

type dockerfileCheckResponse struct {
	Exists bool   `json:"exists"`
	Ports  []int  `json:"ports,omitempty"`
	Path   string `json:"path,omitempty"`
}

type githubContentResponse struct {
	Content  string `json:"content"`
	Encoding string `json:"encoding"`
}

func NewGitHubHandler(rdb *redis.Client) *GitHubHandler {
	return &GitHubHandler{rdb: rdb}
}

func (h *GitHubHandler) ListRepos(c *gin.Context) {
	token, ok := accessTokenFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	usernameRaw, exists := c.Get("username")
	username, ok := usernameRaw.(string)
	if !exists || !ok || strings.TrimSpace(username) == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "username not found"})
		return
	}

	cacheKey := fmt.Sprintf("github:repos:%s", username)
	ctx := c.Request.Context()

	val, err := h.rdb.Get(ctx, cacheKey).Result()
	if err == nil {
		var cachedRepos []Repo
		if err := json.Unmarshal([]byte(val), &cachedRepos); err == nil {
			c.JSON(http.StatusOK, cachedRepos)
			return
		}
	}

	var repos []Repo
	for page := 1; page <= 10; page++ {
		endpoint := fmt.Sprintf(
			"https://api.github.com/user/repos?sort=updated&per_page=100&page=%d",
			page,
		)
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create request"})
			return
		}
		setGitHubHeaders(req, token)

		resp, err := outboundHTTPClient.Do(req)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "github unreachable"})
			return
		}

		var pageRepos []Repo
		decodeErr := json.NewDecoder(resp.Body).Decode(&pageRepos)
		_ = resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			c.JSON(http.StatusBadGateway, gin.H{"error": "github api error"})
			return
		}
		if decodeErr != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "failed to parse github response"})
			return
		}
		repos = append(repos, pageRepos...)
		if len(pageRepos) < 100 {
			break
		}
	}

	if repoData, err := json.Marshal(repos); err == nil {
		h.rdb.Set(ctx, cacheKey, repoData, 5*time.Minute)
	}

	c.JSON(http.StatusOK, repos)
}

func (h *GitHubHandler) CheckDockerfile(c *gin.Context) {
	token, ok := accessTokenFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	userID, err := getUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}
	owner, repo, err := parseRepoURL(
		fmt.Sprintf("https://github.com/%s/%s", c.Param("owner"), c.Param("repo")),
	)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid repository"})
		return
	}
	dockerfilePath, err := normalizeDockerfilePath(c.DefaultQuery("path", "Dockerfile"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if dockerfilePath == "" {
		dockerfilePath = "Dockerfile"
	}
	branch := normalizeBranch(c.Query("branch"))
	ctx := c.Request.Context()

	cacheKey := fmt.Sprintf(
		"github:dockerfile:v3:%s:%s:%s:%s:%s",
		userID,
		owner,
		repo,
		branch,
		dockerfilePath,
	)
	val, err := h.rdb.Get(ctx, cacheKey).Result()
	if err == nil {
		var cached dockerfileCheckResponse
		if json.Unmarshal([]byte(val), &cached) == nil {
			c.JSON(http.StatusOK, cached)
			return
		}
		if val == "true" {
			c.JSON(http.StatusOK, dockerfileCheckResponse{Exists: true})
			return
		}
	}

	endpoint := fmt.Sprintf(
		"https://api.github.com/repos/%s/%s/contents/%s",
		owner,
		repo,
		escapeGitHubPath(dockerfilePath),
	)
	if branch != "" {
		endpoint += "?ref=" + url.QueryEscape(branch)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create request"})
		return
	}
	setGitHubHeaders(req, token)

	resp, err := outboundHTTPClient.Do(req)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "github unreachable"})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		var payload githubContentResponse
		if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse dockerfile metadata"})
			return
		}

		ports := parseDockerfileExposePorts(payload)
		response := dockerfileCheckResponse{
			Exists: true,
			Ports:  ports,
			Path:   dockerfilePath,
		}
		if encoded, err := json.Marshal(response); err == nil {
			h.rdb.Set(ctx, cacheKey, encoded, 10*time.Minute)
		}
		c.JSON(http.StatusOK, response)
		return
	}

	if resp.StatusCode == http.StatusNotFound {
		c.JSON(http.StatusNotFound, gin.H{"exists": false, "path": dockerfilePath})
		return
	}

	c.JSON(http.StatusBadGateway, gin.H{"exists": false, "error": "github api error"})
}

func setGitHubHeaders(req *http.Request, token string) {
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("User-Agent", "Hatch")
}

func parseDockerfileExposePorts(payload githubContentResponse) []int {
	if payload.Encoding != "base64" || payload.Content == "" {
		return nil
	}
	raw, err := base64.StdEncoding.DecodeString(strings.ReplaceAll(payload.Content, "\n", ""))
	if err != nil {
		return nil
	}

	seen := map[int]bool{}
	var ports []int
	for _, line := range strings.Split(string(raw), "\n") {
		line = strings.TrimSpace(strings.Split(line, "#")[0])
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 || !strings.EqualFold(fields[0], "EXPOSE") {
			continue
		}
		for _, token := range fields[1:] {
			portText := strings.Split(token, "/")[0]
			port, err := strconv.Atoi(portText)
			if err != nil || port <= 0 || port > 65535 || seen[port] {
				continue
			}
			seen[port] = true
			ports = append(ports, port)
		}
	}
	return ports
}
