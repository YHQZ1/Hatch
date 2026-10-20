package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestValidOAuthState(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name        string
		cookieState string
		queryState  string
		want        bool
	}{
		{name: "matching", cookieState: "state-value", queryState: "state-value", want: true},
		{name: "different", cookieState: "state-value", queryState: "other-value", want: false},
		{name: "missing query", cookieState: "state-value", queryState: "", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			request := httptest.NewRequest("GET", "/auth/callback?state="+tt.queryState, nil)
			request.AddCookie(&http.Cookie{Name: OAuthStateCookieName, Value: tt.cookieState})
			context, _ := gin.CreateTestContext(httptest.NewRecorder())
			context.Request = request

			if got := validOAuthState(context); got != tt.want {
				t.Fatalf("validOAuthState() = %v, want %v", got, tt.want)
			}
		})
	}
}
