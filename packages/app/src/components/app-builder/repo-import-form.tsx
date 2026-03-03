/**
 * Repo Import Form Component
 * Form for importing from GitHub repository
 */

import { createSignal } from 'solid-js'
import { Button } from '@openhei-ai/ui/button'
import { Input } from '@openhei-ai/ui/input'
import { Label } from '@openhei-ai/ui/label'
import { Textarea } from '@openhei-ai/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@openhei-ai/ui/select'
import { Icon } from '@openhei-ai/ui/icon'
import type { RepoImportFormData } from '@/types/app-builder'

interface RepoImportFormProps {
  onSubmit: (data: RepoImportFormData) => void
  onCancel: () => void
}

export function RepoImportForm(props: RepoImportFormProps) {
  const [repoUrl, setRepoUrl] = createSignal('')
  const [buildInstructions, setBuildInstructions] = createSignal('')
  const [preserveFiles, setPreserveFiles] = createSignal('')
  const [runCommand, setRunCommand] = createSignal('')
  const [definitionOfDone, setDefinitionOfDone] = createSignal('')
  const [generateTarget, setGenerateTarget] = createSignal<'backend' | 'ui' | 'both'>('both')

  const handleSubmit = (e: Event) => {
    e.preventDefault()
    
    const data: RepoImportFormData = {
      repoUrl: repoUrl(),
      buildInstructions: buildInstructions(),
      preserveFiles: preserveFiles(),
      runCommand: runCommand(),
      definitionOfDone: definitionOfDone(),
      generateTarget: generateTarget()
    }
    
    props.onSubmit(data)
  }

  const isValidUrl = (url: string) => {
    return url.includes('github.com') || url.includes('gitlab.com') || url.endsWith('.git')
  }

  return (
    <form onSubmit={handleSubmit} class="space-y-6">
      {/* Repository URL */}
      <div class="space-y-2">
        <Label for="repoUrl">Repository URL *</Label>
        <Input
          id="repoUrl"
          value={repoUrl()}
          onInput={(e) => setRepoUrl(e.currentTarget.value)}
          placeholder="https://github.com/username/repo.git"
          required
        />
        <p class="text-sm text-text-weak">
          Enter the full GitHub or GitLab repository URL
        </p>
      </div>

      {/* Generate Target */}
      <div class="space-y-2">
        <Label>Generate Target</Label>
        <Select value={generateTarget()} onValueChange={(v) => setGenerateTarget(v as any)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="both">Both Backend + UI</SelectItem>
            <SelectItem value="backend">Backend Only</SelectItem>
            <SelectItem value="ui">UI Only</SelectItem>
          </SelectContent>
        </Select>
        <p class="text-sm text-text-weak">
          Choose what parts of the application to generate
        </p>
      </div>

      {/* Build Instructions */}
      <div class="space-y-2">
        <Label for="buildInstructions">Build Instructions</Label>
        <Textarea
          id="buildInstructions"
          value={buildInstructions()}
          onInput={(e) => setBuildInstructions(e.currentTarget.value)}
          placeholder={`Example:
- Install dependencies with npm install
- Build the project with npm run build
- The backend should expose port 3000
- The frontend should be served from the dist folder`}
          rows={5}
        />
        <p class="text-sm text-text-weak">
          Provide detailed instructions on how to build and run this project
        </p>
      </div>

      {/* Preserve Files */}
      <div class="space-y-2">
        <Label for="preserveFiles">Files to Preserve</Label>
        <Textarea
          id="preserveFiles"
          value={preserveFiles()}
          onInput={(e) => setPreserveFiles(e.currentTarget.value)}
          placeholder={`Example:
- README.md
- LICENSE
- .env.example
- docs/`}
          rows={3}
        />
        <p class="text-sm text-text-weak">
          List any files or directories that should not be modified (one per line)
        </p>
      </div>

      {/* Run Command */}
      <div class="space-y-2">
        <Label for="runCommand">Run Command</Label>
        <Input
          id="runCommand"
          value={runCommand()}
          onInput={(e) => setRunCommand(e.currentTarget.value)}
          placeholder="npm start"
        />
        <p class="text-sm text-text-weak">
          Command to start the application after build
        </p>
      </div>

      {/* Definition of Done */}
      <div class="space-y-2">
        <Label for="definitionOfDone">Definition of Done</Label>
        <Textarea
          id="definitionOfDone"
          value={definitionOfDone()}
          onInput={(e) => setDefinitionOfDone(e.currentTarget.value)}
          placeholder={`Example:
- All tests pass
- Application starts without errors
- API endpoints respond correctly
- UI renders without console errors`}
          rows={4}
        />
        <p class="text-sm text-text-weak">
          How will we know the import and build was successful?
        </p>
      </div>

      {/* Run Only Notice */}
      <div class="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div class="flex items-start gap-3">
          <Icon name="alert-triangle" class="w-5 h-5 text-amber-500 mt-0.5" />
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
        <Button type="button" variant="outline" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button 
          type="submit" 
          disabled={!repoUrl().trim() || !isValidUrl(repoUrl())}
        >
          <Icon name="github" class="w-4 h-4 mr-2" />
          Import & Build
        </Button>
      </div>
    </form>
  )
}
