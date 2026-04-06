package handlers

import (
	"context"
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
	token, exists := c.Get("access_token")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing access token"})
		return
	}

	repos, err := fetchGitHubRepos(token.(string))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch repos"})
		return
	}

	c.JSON(http.StatusOK, repos)
}

func fetchGitHubRepos(token string) ([]Repo, error) {
	url := "https://api.github.com/user/repos?sort=updated&per_page=100&type=all"

	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("github api returned %d", resp.StatusCode)
	}

	var repos []Repo
	if err := json.NewDecoder(resp.Body).Decode(&repos); err != nil {
		return nil, err
	}

	return repos, nil
}

func (h *GitHubHandler) CheckDockerfile(c *gin.Context) {
	token, exists := c.Get("access_token")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing access token"})
		return
	}

	owner := c.Param("owner")
	repo := c.Param("repo")
	path := c.DefaultQuery("path", "Dockerfile")

	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/contents/%s", owner, repo, path)

	req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, url, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create request"})
		return
	}

	req.Header.Set("Authorization", "Bearer "+token.(string))
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "network error"})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		c.JSON(http.StatusOK, gin.H{"exists": true})
		return
	}

	if resp.StatusCode == http.StatusNotFound {
		c.JSON(http.StatusNotFound, gin.H{
			"exists": false,
			"error":  fmt.Sprintf("file not found at: %s", path),
		})
		return
	}

	c.JSON(resp.StatusCode, gin.H{"exists": false, "error": "unexpected github response"})
}
