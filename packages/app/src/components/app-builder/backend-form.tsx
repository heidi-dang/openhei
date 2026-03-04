/**
 * Backend Form Component
 * Form for creating a new backend service
 */

import { createSignal, For, Show } from "solid-js"
import { Button } from "@openhei-ai/ui/button"
import { TextField } from "@openhei-ai/ui/text-field"
import { Select } from "@openhei-ai/ui/select"
import { Checkbox } from "@openhei-ai/ui/checkbox"
import { Card, CardContent } from "@openhei-ai/ui/card"
import { Tag } from "@openhei-ai/ui/tag"
import { Icon } from "@openhei-ai/ui/icon"
import type { BackendFormData, DataModelEntity, ApiEndpoint } from "@/types/app-builder"

interface BackendFormProps {
  onSubmit: (data: BackendFormData) => void
  onCancel: () => void
}

interface Option {
  value: string
  label: string
}

export function BackendForm(props: BackendFormProps) {
  const [appName, setAppName] = createSignal("")
  const [description, setDescription] = createSignal("")
  const [auth, setAuth] = createSignal<Option>({ value: "none", label: "None" })
  const [storage, setStorage] = createSignal<Option>({ value: "in-memory", label: "In-Memory" })
  const [rateLimiting, setRateLimiting] = createSignal(false)
  const [logging, setLogging] = createSignal(true)
  const [expectedScale, setExpectedScale] = createSignal<Option>({ value: "low", label: "Low (personal/small team)" })
  const [successCriteria, setSuccessCriteria] = createSignal("")

  const [entities, setEntities] = createSignal<DataModelEntity[]>([])
  const [endpoints, setEndpoints] = createSignal<ApiEndpoint[]>([])

  const [newEntityName, setNewEntityName] = createSignal("")
  const [newEndpointPath, setNewEndpointPath] = createSignal("")
  const [newEndpointMethod, setNewEndpointMethod] = createSignal("GET")
  const [newEndpointPurpose, setNewEndpointPurpose] = createSignal("")

  const handleAddEntity = () => {
    if (!newEntityName().trim()) return
    const entity: DataModelEntity = {
      id: crypto.randomUUID(),
      name: newEntityName(),
      fields: [{ id: crypto.randomUUID(), name: "id", type: "string", required: true }],
      description: "",
    }
    setEntities([...entities(), entity])
    setNewEntityName("")
  }

  const handleRemoveEntity = (id: string) => {
    setEntities(entities().filter((e) => e.id !== id))
  }

  const handleAddEndpoint = () => {
    if (!newEndpointPath().trim() || !newEndpointPurpose().trim()) return
    const endpoint: ApiEndpoint = {
      id: crypto.randomUUID(),
      path: newEndpointPath(),
      method: newEndpointMethod() as "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
      purpose: newEndpointPurpose(),
    }
    setEndpoints([...endpoints(), endpoint])
    setNewEndpointPath("")
    setNewEndpointPurpose("")
  }

  const handleRemoveEndpoint = (id: string) => {
    setEndpoints(endpoints().filter((e) => e.id !== id))
  }

  const handleSubmit = (e: Event) => {
    e.preventDefault()

    const data: BackendFormData = {
      appName: appName(),
      description: description(),
      dataModel: entities(),
      endpoints: endpoints(),
      auth: auth().value as "none" | "api-key" | "jwt" | "oauth",
      storage: storage().value as "in-memory" | "sqlite" | "json-file" | "postgresql",
      externalIntegrations: [],
      nonFunctionalReqs: {
        rateLimiting: rateLimiting(),
        logging: logging(),
        expectedScale: expectedScale().value as "low" | "medium" | "high",
      },
      successCriteria: successCriteria(),
    }

    props.onSubmit(data)
  }

  const methodOptions = ["GET", "POST", "PUT", "PATCH", "DELETE"]
  const authOptions: Option[] = [
    { value: "none", label: "None" },
    { value: "api-key", label: "API Key" },
    { value: "jwt", label: "JWT" },
    { value: "oauth", label: "OAuth 2.0" },
  ]
  const storageOptions: Option[] = [
    { value: "in-memory", label: "In-Memory" },
    { value: "json-file", label: "JSON File" },
    { value: "sqlite", label: "SQLite" },
    { value: "postgresql", label: "PostgreSQL" },
  ]
  const scaleOptions: Option[] = [
    { value: "low", label: "Low (personal/small team)" },
    { value: "medium", label: "Medium (growing product)" },
    { value: "high", label: "High (enterprise scale)" },
  ]

  const getAuthOption = (value: string): Option => authOptions.find((o) => o.value === value) || authOptions[0]

  const getStorageOption = (value: string): Option => storageOptions.find((o) => o.value === value) || storageOptions[0]

  const getScaleOption = (value: string): Option => scaleOptions.find((o) => o.value === value) || scaleOptions[0]

  return (
    <form onSubmit={handleSubmit} class="space-y-6">
      {/* Step 1: Basic Info */}
      <div class="space-y-4">
        <div class="flex items-center gap-2 mb-2">
          <span class="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
            1
          </span>
          <h3 class="font-medium">Basic Information</h3>
        </div>
        <p class="text-sm text-text-weak -mt-2 ml-8">Give your backend a name and description</p>

        <TextField value={appName()} onChange={setAppName} label="Application Name *" placeholder="e.g., Tasks API" />

        <TextField
          value={description()}
          onChange={setDescription}
          label="Description"
          placeholder="What does this backend service do?"
          multiline
          rows={3}
        />
      </div>

      {/* Step 2: Data Model */}
      <div class="space-y-4">
        <div class="flex items-center gap-2 mb-2">
          <span class="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
            2
          </span>
          <h3 class="font-medium">Data Model</h3>
        </div>
        <p class="text-sm text-text-weak -mt-2 ml-8">Define the entities your backend will manage</p>

        <Card>
          <CardContent class="pt-4 space-y-4">
            <div class="flex flex-col sm:flex-row gap-2">
              <TextField
                value={newEntityName()}
                onChange={setNewEntityName}
                placeholder="Entity name (e.g., Task, User)"
                class="flex-1"
              />
              <Button type="button" onClick={handleAddEntity} variant="secondary" class="w-full sm:w-auto">
                <Icon name="plus" class="w-4 h-4 mr-2 sm:mr-0" />
                <span class="sm:hidden">Add Entity</span>
              </Button>
            </div>

            <div class="space-y-2">
              <For each={entities()}>
                {(entity) => (
                  <div class="flex items-center justify-between p-3 bg-surface-2 rounded-lg">
                    <div class="min-w-0 flex-1">
                      <span class="font-medium truncate block">{entity.name}</span>
                      <span class="text-sm text-text-weak">({entity.fields.length} fields)</span>
                    </div>
                    <Button type="button" variant="ghost" size="small" onClick={() => handleRemoveEntity(entity.id)}>
                      <Icon name="close" class="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </For>
              {entities().length === 0 && (
                <p class="text-sm text-text-weak text-center py-4">No entities defined yet. Add one above.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Step 3: API Endpoints */}
      <div class="space-y-4">
        <div class="flex items-center gap-2 mb-2">
          <span class="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
            3
          </span>
          <h3 class="font-medium">API Endpoints</h3>
        </div>
        <p class="text-sm text-text-weak -mt-2 ml-8">Define the endpoints your API will expose</p>

        <Card>
          <CardContent class="pt-4 space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <Select
                value={newEndpointMethod()}
                onChange={(v) => v && setNewEndpointMethod(v)}
                options={methodOptions}
                class="sm:col-span-3"
                variant="secondary"
              />
              <TextField
                value={newEndpointPath()}
                onChange={setNewEndpointPath}
                placeholder="/api/..."
                class="sm:col-span-4"
              />
              <TextField
                value={newEndpointPurpose()}
                onChange={setNewEndpointPurpose}
                placeholder="Purpose"
                class="sm:col-span-4"
              />
              <Button type="button" onClick={handleAddEndpoint} variant="secondary" class="sm:col-span-1 w-full">
                <Icon name="plus" class="w-4 h-4" />
              </Button>
            </div>

            <div class="space-y-2">
              <For each={endpoints()}>
                {(endpoint) => (
                  <div class="flex items-center justify-between p-3 bg-surface-2 rounded-lg">
                    <div class="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                      <Tag class="flex-shrink-0 text-xs">{endpoint.method}</Tag>
                      <code class="text-sm truncate">{endpoint.path}</code>
                      <span class="text-sm text-text-weak hidden sm:inline truncate">{endpoint.purpose}</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="small"
                      onClick={() => handleRemoveEndpoint(endpoint.id)}
                      class="flex-shrink-0"
                    >
                      <Icon name="close" class="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </For>
              {endpoints().length === 0 && (
                <p class="text-sm text-text-weak text-center py-4">No endpoints defined yet. Add one above.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Step 4: Configuration */}
      <div class="space-y-4">
        <div class="flex items-center gap-2 mb-2">
          <span class="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
            4
          </span>
          <h3 class="font-medium">Configuration</h3>
        </div>
        <p class="text-sm text-text-weak -mt-2 ml-8">Choose authentication, storage, and scale</p>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="space-y-2">
            <label class="text-sm font-medium">Authentication</label>
            <Select
              value={auth().value}
              onChange={(v) => v && setAuth(getAuthOption(v))}
              options={authOptions.map((o) => o.value)}
              placeholder="Select auth"
              variant="secondary"
            />
          </div>

          <div class="space-y-2">
            <label class="text-sm font-medium">Storage</label>
            <Select
              value={storage().value}
              onChange={(v: string | undefined) => v && setStorage(getStorageOption(v))}
              options={storageOptions.map((o) => o.value)}
              placeholder="Select storage"
              variant="secondary"
            />
          </div>
        </div>

        <div class="space-y-2">
          <label class="text-sm font-medium">Expected Scale</label>
          <Select
            value={expectedScale().value}
            onChange={(v: string | undefined) => v && setExpectedScale(getScaleOption(v))}
            options={scaleOptions.map((o) => o.value)}
            placeholder="Select scale"
            variant="secondary"
          />
        </div>

        <div class="flex flex-wrap gap-4">
          <div class="flex items-center space-x-2">
            <Checkbox id="rateLimiting" checked={rateLimiting()} onChange={setRateLimiting} />
            <label for="rateLimiting" class="cursor-pointer text-sm">
              Rate Limiting
            </label>
          </div>
          <div class="flex items-center space-x-2">
            <Checkbox id="logging" checked={logging()} onChange={setLogging} />
            <label for="logging" class="cursor-pointer text-sm">
              Request Logging
            </label>
          </div>
        </div>
      </div>

      {/* Step 5: Success Criteria */}
      <div class="space-y-4">
        <div class="flex items-center gap-2 mb-2">
          <span class="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
            5
          </span>
          <h3 class="font-medium">Success Criteria</h3>
        </div>
        <p class="text-sm text-text-weak -mt-2 ml-8">How will we know this backend is working?</p>

        <TextField
          value={successCriteria()}
          onChange={setSuccessCriteria}
          placeholder="e.g., All CRUD operations work correctly, API responds within 200ms"
          multiline
          rows={3}
        />
      </div>

      <div class="flex flex-col sm:flex-row justify-end gap-2 pt-4 border-t">
        <Button type="button" variant="ghost" onClick={props.onCancel} class="w-full sm:w-auto">
          Cancel
        </Button>
        <Button type="submit" disabled={!appName().trim()} class="w-full sm:w-auto">
          <Icon name="prompt" class="w-4 h-4 mr-2" />
          Create & Build
        </Button>
      </div>
    </form>
  )
}
