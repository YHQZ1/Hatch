package middleware

import (
	"fmt"
	"log"
	"time"

	"github.com/gin-gonic/gin"
)

// StatTracker captures the "Golden Signals" of every request:
// Latency, Traffic, and Errors.
func StatTracker() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 1. Capture the exact start time
		start := time.Now()

		// 2. Continue to the next handler (Your API logic)
		c.Next()

		// 3. Calculate metrics after the response is sent
		latency := time.Since(start)
		status := c.Writer.Status()
		method := c.Request.Method
		path := c.Request.URL.Path

		// Color-coding the status for easier terminal reading
		statusColor := "32" // Green for 2xx
		if status >= 400 && status < 500 {
			statusColor = "33" // Yellow for 4xx
		} else if status >= 500 {
			statusColor = "31" // Red for 5xx
		}

		// LOG FORMAT: [METRIC] | STATUS | LATENCY | METHOD | PATH
		// This uses ANSI escape codes for colors in the terminal.
		log.Printf(
			"\033[1;%sm[METRIC]\033[0m | %d | %13v | %s | %s",
			statusColor,
			status,
			latency,
			method,
			path,
		)

		// 4. Inject a custom header so the Frontend can see the processing time
		c.Header("X-Hatch-Trace-Duration", fmt.Sprintf("%v", latency))

		// If you later integrate Prometheus, this is where you'd
		// increment your counters:
		// RequestsTotal.Inc()
		// RequestDuration.Observe(latency.Seconds())
	}
}
