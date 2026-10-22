package handlers

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/YHQZ1/hatch/internal/githubapp"
)

// InstallationTokens mints the short-lived, read-only token Hatch uses to read
// one repository through the GitHub App (ADR 0010). It is the same source the
// build uses, so what the handlers check is what the build will be able to do.
type InstallationTokens interface {
	InstallationToken(ctx context.Context, owner, name string) (string, error)
}

// repoAccess is why Hatch cannot read a repository, in words for the user, with
// the HTTP status the request that asked deserves.
type repoAccess struct {
	status  int
	message string
}

func (e *repoAccess) Error() string { return e.message }

// tokenForRepo returns a token that can read the repository, or a *repoAccess
// saying why not. notInstalledStatus is what to answer when the App is simply
// not installed there: that is the user's to fix, so what is right depends on
// whether they were creating something (400) or acting on something that exists (409).
func tokenForRepo(ctx context.Context, tokens InstallationTokens, repoURL string, notInstalledStatus int) (string, *repoAccess) {
	owner, name, err := githubapp.ParseRepoURL(repoURL)
	if err != nil {
		return "", &repoAccess{status: http.StatusBadRequest, message: "repo_url must be a valid GitHub repository URL"}
	}
	token, err := tokens.InstallationToken(ctx, owner, name)
	switch {
	case errors.Is(err, githubapp.ErrNotInstalled):
		return "", &repoAccess{
			status:  notInstalledStatus,
			message: fmt.Sprintf("The Hatch GitHub App is not installed on %s/%s. Install it on the repository (Settings > GitHub in Hatch, or the Install link on the New project page), then try again.", owner, name),
		}
	case err != nil:
		slog.WarnContext(ctx, "could not get a GitHub installation token", "repository", owner+"/"+name, "error", err)
		return "", &repoAccess{status: http.StatusBadGateway, message: "Hatch could not get access to the repository through GitHub right now. Try again in a moment."}
	}
	return token, nil
}

// requireRepoAccess checks, with the signed-in user's own GitHub token, that the
// user may use the repository: GitHub answers for the user's token only for
// repositories the user can see and the Hatch App is installed on. It returns the
// status and message to answer with, or an empty message when the user may.
//
// This is the ownership check. The installation token the build uses reads
// every repository the App is installed on, so it can say nothing about who is
// allowed to ask for one.
func (h *ProjectHandler) requireRepoAccess(c *gin.Context, repoURL string) (int, string) {
	owner, name, err := githubapp.ParseRepoURL(repoURL)
	if err != nil {
		return http.StatusBadRequest, "repo_url must be a valid GitHub repository URL"
	}
	token, ok := h.userToken(c)
	if !ok {
		return http.StatusUnauthorized, "Sign in again: GitHub no longer accepts your session."
	}
	status, _, err := githubGet(c.Request.Context(), fmt.Sprintf("%s/repos/%s/%s", h.githubAPI, owner, name), token)
	switch {
	case err != nil:
		slog.WarnContext(c.Request.Context(), "could not check a user's access to a repository", "repository", owner+"/"+name, "error", err)
		return http.StatusBadGateway, "Hatch could not check the repository with GitHub right now. Try again in a moment."
	case status == http.StatusUnauthorized:
		return http.StatusUnauthorized, "Sign in again: GitHub no longer accepts your session."
	case status == http.StatusNotFound || status == http.StatusForbidden:
		return http.StatusBadRequest, fmt.Sprintf("Hatch could not find %s/%s with your GitHub account. Check that it exists and that the Hatch GitHub App is installed on it.", owner, name)
	case status < 200 || status >= 300:
		return http.StatusBadGateway, "Hatch could not check the repository with GitHub right now. Try again in a moment."
	}
	return 0, ""
}
