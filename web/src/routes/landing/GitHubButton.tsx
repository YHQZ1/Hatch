import { siGithub } from "simple-icons";
import BrandIcon from "@/components/BrandIcon";
import Button from "./Button";
import { REPO_URL } from "./links";

/** The primary call to action: opens the repository, with the GitHub mark. */
export default function GitHubButton() {
  return (
    <Button
      href={REPO_URL}
      icon={<BrandIcon icon={siGithub} color="currentColor" className="h-4 w-4" />}
    >
      View on GitHub
    </Button>
  );
}
