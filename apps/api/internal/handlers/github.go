package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
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

func NewGitHubHandler(rdb *redis.Client) *GitHubHandler {
	return &GitHubHandler{rdb: rdb}
}

func (h *GitHubHandler) ListRepos(c *gin.Context) {
	token, _ := c.Get("access_token")
	username, _ := c.Get("username")
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

	url := "https://api.github.com/user/repos?sort=updated&per_page=100"
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	req.Header.Set("Authorization", "Bearer "+token.(string))
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "github unreachable"})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		c.JSON(resp.StatusCode, gin.H{"error": "github api error"})
		return
	}

	var repos []Repo
	if err := json.NewDecoder(resp.Body).Decode(&repos); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "parse error"})
		return
	}

	repoData, _ := json.Marshal(repos)
	h.rdb.Set(ctx, cacheKey, repoData, 5*time.Minute)

	c.JSON(http.StatusOK, repos)
}

func (h *GitHubHandler) CheckDockerfile(c *gin.Context) {
	token, _ := c.Get("access_token")
	owner := c.Param("owner")
	repo := c.Param("repo")
	path := c.DefaultQuery("path", "Dockerfile")
	ctx := c.Request.Context()

	cacheKey := fmt.Sprintf("github:dockerfile:%s:%s:%s", owner, repo, path)
	val, err := h.rdb.Get(ctx, cacheKey).Result()
	if err == nil {
		if val == "true" {
			c.JSON(http.StatusOK, gin.H{"exists": true})
			return
		}
	}

	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/contents/%s", owner, repo, path)
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	req.Header.Set("Authorization", "Bearer "+token.(string))
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "network error"})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		h.rdb.Set(ctx, cacheKey, "true", 10*time.Minute)
		c.JSON(http.StatusOK, gin.H{"exists": true})
		return
	}

	if resp.StatusCode == http.StatusNotFound {
		c.JSON(http.StatusNotFound, gin.H{"exists": false, "path": path})
		return
	}

	c.JSON(resp.StatusCode, gin.H{"exists": false, "error": "unexpected response"})
}
