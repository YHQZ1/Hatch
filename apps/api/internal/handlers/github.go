package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
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

type GitHubHandler struct{}

func NewGitHubHandler() *GitHubHandler {
	return &GitHubHandler{}
}

func (h *GitHubHandler) ListRepos(c *gin.Context) {
	token, _ := c.Get("access_token")

	url := "https://api.github.com/user/repos?sort=updated&per_page=100"
	req, _ := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, url, nil)
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

	c.JSON(http.StatusOK, repos)
}

func (h *GitHubHandler) CheckDockerfile(c *gin.Context) {
	token, _ := c.Get("access_token")
	owner := c.Param("owner")
	repo := c.Param("repo")
	path := c.DefaultQuery("path", "Dockerfile")

	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/contents/%s", owner, repo, path)
	req, _ := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, url, nil)
	req.Header.Set("Authorization", "Bearer "+token.(string))
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "network error"})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		c.JSON(http.StatusOK, gin.H{"exists": true})
		return
	}

	if resp.StatusCode == http.StatusNotFound {
		c.JSON(http.StatusNotFound, gin.H{"exists": false, "path": path})
		return
	}

	c.JSON(resp.StatusCode, gin.H{"exists": false, "error": "unexpected response"})
}
