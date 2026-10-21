// Command hatch runs the Hatch control plane.
//
// Until the services are merged into `serve` and `worker`, each subcommand
// runs one of the former services unchanged.
package main

import (
	"fmt"
	"os"
)

const usage = `Usage: hatch <command>

Commands:
  api        run the HTTP API and WebSocket log hub
  builder    run the build worker (clone, docker build, push to ECR)
  deployer   run the deploy worker (ECS services and ALB routing)

Configuration is read from the environment and from a .env file in the
current directory.
`

func main() {
	if len(os.Args) != 2 {
		fmt.Fprint(os.Stderr, usage)
		os.Exit(2)
	}

	switch os.Args[1] {
	case "api":
		runAPI()
	case "builder":
		runBuilder()
	case "deployer":
		runDeployer()
	case "help", "-h", "--help":
		fmt.Print(usage)
	default:
		fmt.Fprintf(os.Stderr, "hatch: unknown command %q\n\n%s", os.Args[1], usage)
		os.Exit(2)
	}
}
