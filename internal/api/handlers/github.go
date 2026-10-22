package handlers

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

type Repo struct {
	ID            int64  `json:"id"`
	Name          string `json:"name"`
	FullName      string `json:"full_name"`
	Private       bool   `json:"private"`
	HTMLURL       string `json:"html_url"`
	Description   string `json:"description"`
	Language      string `json:"language"`
	DefaultBranch string `json:"default_branch"`
	UpdatedAt     string `json:"updated_at"`
}

// Installation is one place the Hatch App is installed: a user or an
// organization account.
type Installation struct {
	ID      int64  `json:"id"`
	Account string `json:"account"`
	// Type is "User" or "Organization".
	Type string `json:"type"`
}

// reposResponse is what the web UI shows on the new-service page. Installed is
// false until the user has installed the App anywhere; the UI then sends them
// to /auth/install.
type reposResponse struct {
	Installed     bool           `json:"installed"`
	Installations []Installation `json:"installations"`
	Repos         []Repo         `json:"repos"`
}

type GitHubHandler struct {
	rdb *redis.Client

	// apiURL is GitHub's API origin; tests point it at a fake.
	apiURL string
	// token returns the signed-in user's GitHub token; tests replace it.
	token func(*gin.Context) (string, bool)
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
	return &GitHubHandler{rdb: rdb, apiURL: "https://api.github.com", token: accessTokenFromContext}
}

// Limits on how much of GitHub's paginated lists Hatch reads: generous for one
// person, but bounded so that a huge organization cannot make a request run
// away.
const (
	maxInstallationPages = 5
	maxRepoPages         = 10
	githubPageSize       = 100
)

// errGitHubUnauthorized means GitHub rejected the user's token.
var errGitHubUnauthorized = errors.New("github rejected the access token")

// getJSON fetches one GitHub API path with the user's token and decodes it.
func (h *GitHubHandler) getJSON(ctx context.Context, token, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, h.apiURL+path, nil)
	if err != nil {
		return err
	}
	setGitHubHeaders(req, token)

	resp, err := outboundHTTPClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusUnauthorized {
		return errGitHubUnauthorized
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("github returned status %d for %s", resp.StatusCode, path)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

// ListRepos lists the repositories Hatch may read: those the user has given
// the Hatch App access to. Repositories the user can reach on GitHub but has
// not granted to the App are deliberately absent (ADR 0010). It is not cached,
// so a repository added in GitHub's installation settings shows up on the next
// load.
func (h *GitHubHandler) ListRepos(c *gin.Context) {
	token, ok := h.token(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}
	ctx := c.Request.Context()

	installations, err := h.listInstallations(ctx, token)
	if err != nil {
		h.respondGitHubError(c, "failed to list GitHub App installations", err)
		return
	}

	response := reposResponse{
		Installed:     len(installations) > 0,
		Installations: installations,
		Repos:         []Repo{},
	}
	seen := map[int64]bool{}
	for _, installation := range installations {
		repos, err := h.listInstallationRepos(ctx, token, installation.ID)
		if err != nil {
			h.respondGitHubError(c, "failed to list installation repositories", err)
			return
		}
		for _, repo := range repos {
			if !seen[repo.ID] {
				seen[repo.ID] = true
				response.Repos = append(response.Repos, repo)
			}
		}
	}
	// Most recently updated first; GitHub timestamps sort as text.
	sort.SliceStable(response.Repos, func(i, j int) bool {
		return response.Repos[i].UpdatedAt > response.Repos[j].UpdatedAt
	})

	c.JSON(http.StatusOK, response)
}

func (h *GitHubHandler) respondGitHubError(c *gin.Context, message string, err error) {
	if errors.Is(err, errGitHubUnauthorized) {
		// The token was revoked or has died; the user has to sign in again.
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}
	slog.ErrorContext(c.Request.Context(), message, "error", err)
	c.JSON(http.StatusBadGateway, gin.H{"error": "github unavailable"})
}

func (h *GitHubHandler) listInstallations(ctx context.Context, token string) ([]Installation, error) {
	installations := []Installation{}
	for page := 1; page <= maxInstallationPages; page++ {
		var payload struct {
			Installations []struct {
				ID      int64 `json:"id"`
				Account struct {
					Login string `json:"login"`
					Type  string `json:"type"`
				} `json:"account"`
			} `json:"installations"`
		}
		path := fmt.Sprintf("/user/installations?per_page=%d&page=%d", githubPageSize, page)
		if err := h.getJSON(ctx, token, path, &payload); err != nil {
			return nil, err
		}
		for _, item := range payload.Installations {
			installations = append(installations, Installation{
				ID:      item.ID,
				Account: item.Account.Login,
				Type:    item.Account.Type,
			})
		}
		if len(payload.Installations) < githubPageSize {
			break
		}
	}
	return installations, nil
}

func (h *GitHubHandler) listInstallationRepos(ctx context.Context, token string, installationID int64) ([]Repo, error) {
	var repos []Repo
	for page := 1; page <= maxRepoPages; page++ {
		var payload struct {
			Repositories []Repo `json:"repositories"`
		}
		path := fmt.Sprintf("/user/installations/%d/repositories?per_page=%d&page=%d", installationID, githubPageSize, page)
		if err := h.getJSON(ctx, token, path, &payload); err != nil {
			return nil, err
		}
		repos = append(repos, payload.Repositories...)
		if len(payload.Repositories) < githubPageSize {
			break
		}
	}
	return repos, nil
}

func (h *GitHubHandler) CheckDockerfile(c *gin.Context) {
	token, ok := h.token(c)
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
		"%s/repos/%s/%s/contents/%s",
		h.apiURL,
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
