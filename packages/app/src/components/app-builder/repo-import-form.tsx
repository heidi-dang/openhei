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
      {/* Step 1: Repository URL */}
      <div class="space-y-2">
        <div class="flex items-center gap-2 mb-2">
          <span class="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
            1
          </span>
          <label class="text-sm font-medium">Repository URL *</label>
        </div>
        <p class="text-sm text-text-weak ml-8">Enter the full GitHub or GitLab repository URL</p>
        <TextField
          value={repoUrl()}
          onChange={setRepoUrl}
          placeholder="https://github.com/username/repo.git"
          required
        />
      </div>

      {/* Step 2: Generate Target */}
      <div class="space-y-2">
        <div class="flex items-center gap-2 mb-2">
          <span class="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
            2
          </span>
          <label class="text-sm font-medium">Generate Target</label>
        </div>
        <p class="text-sm text-text-weak ml-8">Choose what parts of the application to generate</p>
        <Select
          value={generateTarget()}
          onChange={(v: "backend" | "both" | "ui" | undefined) => v && setGenerateTarget(v)}
          options={generateTargetOptions.map((o) => o.value)}
          placeholder="Select target"
        />
      </div>

      {/* Step 3: Build Instructions */}
      <div class="space-y-2">
        <div class="flex items-center gap-2 mb-2">
          <span class="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
            3
          </span>
          <label class="text-sm font-medium">Build Instructions</label>
        </div>
        <p class="text-sm text-text-weak ml-8">Provide detailed instructions on how to build and run this project</p>
        <TextField
          value={buildInstructions()}
          onChange={setBuildInstructions}
          placeholder={`Example:
- Install dependencies with npm install
- Build the project with npm run build
- The backend should expose port 3000
- The frontend should be served from the dist folder`}
          multiline
          rows={5}
        />
      </div>

      {/* Step 4: Files to Preserve */}
      <div class="space-y-2">
        <div class="flex items-center gap-2 mb-2">
          <span class="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
            4
          </span>
          <label class="text-sm font-medium">Files to Preserve</label>
        </div>
        <p class="text-sm text-text-weak ml-8">
          List any files or directories that should not be modified (one per line)
        </p>
        <TextField
          value={preserveFiles()}
          onChange={setPreserveFiles}
          placeholder={`Example:
- README.md
- LICENSE
- .env.example
- docs/`}
          multiline
          rows={4}
        />
      </div>

      {/* Step 5: Run Command */}
      <div class="space-y-2">
        <div class="flex items-center gap-2 mb-2">
          <span class="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
            5
          </span>
          <label class="text-sm font-medium">Run Command</label>
        </div>
        <p class="text-sm text-text-weak ml-8">Command to start the application after build</p>
        <TextField value={runCommand()} onChange={setRunCommand} placeholder="npm start" />
      </div>

      {/* Step 6: Definition of Done */}
      <div class="space-y-2">
        <div class="flex items-center gap-2 mb-2">
          <span class="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
            6
          </span>
          <label class="text-sm font-medium">Definition of Done</label>
        </div>
        <p class="text-sm text-text-weak ml-8">How will we know the import and build was successful?</p>
        <TextField
          value={definitionOfDone()}
          onChange={setDefinitionOfDone}
          placeholder={`Example:
- All tests pass
- Application starts without errors
- API endpoints respond correctly
- UI renders without console errors`}
          multiline
          rows={4}
        />
      </div>

      {/* Run Only Notice */}
      <div class="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div class="flex items-start gap-3">
          <Icon name="alert-circle" class="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
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
      <div class="flex flex-col sm:flex-row justify-end gap-2 pt-4 border-t">
        <Button type="button" variant="ghost" onClick={props.onCancel} class="w-full sm:w-auto">
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          disabled={!repoUrl().trim() || !isValidUrl(repoUrl())}
          class="w-full sm:w-auto"
        >
          <Icon name="github" class="w-4 h-4 mr-2" />
          Import & Build
        </Button>
      </div>
    </form>
  )
}
