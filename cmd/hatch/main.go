// Command hatch runs the Hatch control plane.
package main

import (
	"fmt"
	"log"
	"os"

	"github.com/joho/godotenv"
)

const usage = `Usage: hatch <command>

Commands:
  serve      run the web UI, the API, and the build and deploy workers
  worker     run only the build and deploy workers
  migrate    apply database migrations and exit
  version    print the version

Configuration is read from the environment and from a .env file in the
current directory.
`

func main() {
	if len(os.Args) != 2 {
		fmt.Fprint(os.Stderr, usage)
		os.Exit(2)
	}

	// A missing .env is normal (production sets real environment variables).
	_ = godotenv.Load()

	var err error
	switch os.Args[1] {
	case "serve":
		err = runServe()
	case "worker":
		err = runWorkers()
	case "migrate":
		err = runMigrate()
	case "version", "--version":
		fmt.Println(versionString())
	case "help", "-h", "--help":
		fmt.Print(usage)
	default:
		fmt.Fprintf(os.Stderr, "hatch: unknown command %q\n\n%s", os.Args[1], usage)
		os.Exit(2)
	}
	if err != nil {
		log.Printf("hatch %s: %v", os.Args[1], err)
		os.Exit(1)
	}
}
