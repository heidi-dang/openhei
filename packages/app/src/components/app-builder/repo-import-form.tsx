/**
 * Repo Import Form Component
 * Form for importing from GitHub repository
 */

import { createSignal } from "solid-js"
import { Button } from "@openhei-ai/ui/button"
import { TextField } from "@openhei-ai/ui/text-field"
import { Select } from "@openhei-ai/ui/select"
import { Icon } from "@openhei-ai/ui/icon"
import type { RepoImportFormData } from "@/types/app-builder"

interface RepoImportFormProps {
  onSubmit: (data: RepoImportFormData) => void
  onCancel: () => void
}

export function RepoImportForm(props: RepoImportFormProps) {
  const [repoUrl, setRepoUrl] = createSignal("")
  const [buildInstructions, setBuildInstructions] = createSignal("")
  const [preserveFiles, setPreserveFiles] = createSignal("")
  const [runCommand, setRunCommand] = createSignal("")
  const [definitionOfDone, setDefinitionOfDone] = createSignal("")
  const [generateTarget, setGenerateTarget] = createSignal<"backend" | "ui" | "both">("both")

  const handleSubmit = (e: Event) => {
    e.preventDefault()

    const data: RepoImportFormData = {
      repoUrl: repoUrl(),
      buildInstructions: buildInstructions(),
      preserveFiles: preserveFiles(),
      runCommand: runCommand(),
      definitionOfDone: definitionOfDone(),
      generateTarget: generateTarget(),
    }

    props.onSubmit(data)
  }

  const isValidUrl = (url: string) => {
    return url.includes("github.com") || url.includes("gitlab.com") || url.endsWith(".git")
  }

  const generateTargetOptions = [
    { value: "both" as const, label: "Both Backend + UI" },
    { value: "backend" as const, label: "Backend Only" },
    { value: "ui" as const, label: "UI Only" },
  ]

  return (
    <form onSubmit={handleSubmit} class="space-y-6">
      {/* Repository URL */}
      <div class="space-y-2">
        <TextField
          label="Repository URL *"
          value={repoUrl()}
          onInput={(e) => setRepoUrl(e.currentTarget.value)}
          placeholder="https://github.com/username/repo.git"
          required
        />
        <p class="text-sm text-text-weak">Enter the full GitHub or GitLab repository URL</p>
      </div>

      {/* Generate Target */}
      <div class="space-y-2">
        <TextField label="Generate Target" />
        <Select
          options={generateTargetOptions}
          current={generateTargetOptions.find((o) => o.value === generateTarget())}
          value={(o) => o.value}
          label={(o) => o.label}
          onSelect={(o) => o && setGenerateTarget(o.value)}
        />
        <p class="text-sm text-text-weak">Choose what parts of the application to generate</p>
      </div>

      {/* Build Instructions */}
      <div class="space-y-2">
        <TextField
          label="Build Instructions"
          value={buildInstructions()}
          onInput={(e) => setBuildInstructions(e.currentTarget.value)}
          placeholder={`Example:
- Install dependencies with npm install
- Build the project with npm run build
- The backend should expose port 3000
- The frontend should be served from the dist folder`}
        />
        <p class="text-sm text-text-weak">Provide detailed instructions on how to build and run this project</p>
      </div>

      {/* Preserve Files */}
      <div class="space-y-2">
        <TextField
          label="Files to Preserve"
          value={preserveFiles()}
          onInput={(e) => setPreserveFiles(e.currentTarget.value)}
          placeholder={`Example:
- README.md
- LICENSE
- .env.example
- docs/`}
        />
        <p class="text-sm text-text-weak">List any files or directories that should not be modified (one per line)</p>
      </div>

      {/* Run Command */}
      <div class="space-y-2">
        <TextField
          label="Run Command"
          value={runCommand()}
          onInput={(e) => setRunCommand(e.currentTarget.value)}
          placeholder="npm start"
        />
        <p class="text-sm text-text-weak">Command to start the application after build</p>
      </div>

      {/* Definition of Done */}
      <div class="space-y-2">
        <TextField
          label="Definition of Done"
          value={definitionOfDone()}
          onInput={(e) => setDefinitionOfDone(e.currentTarget.value)}
          placeholder={`Example:
- All tests pass
- Application starts without errors
- API endpoints respond correctly
- UI renders without console errors`}
        />
        <p class="text-sm text-text-weak">How will we know the import and build was successful?</p>
      </div>

      {/* Run Only Notice */}
      <div class="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div class="flex items-start gap-3">
          <Icon name="alert-circle" class="w-5 h-5 text-amber-500 mt-0.5" />
          <div class="text-sm text-amber-800">
            <p class="font-medium">Repo Import (Run Only)</p>
            <p class="mt-1">
              This mode only clones and runs the repository. <strong>No AI changes will be made.</strong>
            </p>
            <ul class="list-disc list-inside mt-2 space-y-1">
              <li>Clone the repository to your workspace</li>
              <li>Detect run scripts from package.json</li>
              <li>Install dependencies and start the app</li>
              <li>Provide logs and status updates</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div class="flex justify-end gap-2 pt-4 border-t">
        <Button type="button" variant="ghost" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={!repoUrl().trim() || !isValidUrl(repoUrl())}>
          <Icon name="github" class="w-4 h-4 mr-2" />
          Import & Build
        </Button>
      </div>
    </form>
  )
}
