package middleware

import (
	"fmt"
	"log"
	"time"

	"github.com/gin-gonic/gin"
)

func StatTracker() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()

		c.Next()

		latency := time.Since(start)
		status := c.Writer.Status()
		method := c.Request.Method
		path := c.Request.URL.Path

		statusColor := "32"
		if status >= 400 && status < 500 {
			statusColor = "33"
		} else if status >= 500 {
			statusColor = "31"
		}

		log.Printf(
			"\033[1;%sm[METRIC]\033[0m | %d | %13v | %s | %s",
			statusColor,
			status,
			latency,
			method,
			path,
		)

		c.Header("X-Hatch-Trace-Duration", fmt.Sprintf("%v", latency))
	}
}
