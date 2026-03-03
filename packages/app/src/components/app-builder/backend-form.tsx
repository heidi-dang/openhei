/**
 * Backend Form Component
 * Form for creating a new backend service
 */

import { createSignal, For } from "solid-js"
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

  return (
    <form onSubmit={handleSubmit} class="space-y-6">
      <div class="space-y-4">
        <h3 class="font-medium">Basic Information</h3>

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

      <div class="space-y-4">
        <h3 class="font-medium">Data Model</h3>

        <Card>
          <CardContent class="pt-4 space-y-4">
            <div class="flex gap-2">
              <TextField
                value={newEntityName()}
                onChange={setNewEntityName}
                placeholder="Entity name (e.g., Task, User)"
                class="flex-1"
              />
              <Button type="button" onClick={handleAddEntity} variant="secondary">
                <Icon name="plus" />
              </Button>
            </div>

            <div class="space-y-2">
              <For each={entities()}>
                {(entity) => (
                  <div class="flex items-center justify-between p-3 bg-surface-2 rounded-lg">
                    <div>
                      <span class="font-medium">{entity.name}</span>
                      <span class="text-sm text-text-weak ml-2">({entity.fields.length} fields)</span>
                    </div>
                    <Button type="button" variant="ghost" size="small" onClick={() => handleRemoveEntity(entity.id)}>
                      <Icon name="close" />
                    </Button>
                  </div>
                )}
              </For>
              {entities().length === 0 && (
                <p class="text-sm text-text-weak text-center py-4">No entities defined yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div class="space-y-4">
        <h3 class="font-medium">API Endpoints</h3>

        <Card>
          <CardContent class="pt-4 space-y-4">
            <div class="grid grid-cols-12 gap-2">
              <Select
                current={newEndpointMethod()}
                onSelect={(v) => v && setNewEndpointMethod(v)}
                options={methodOptions}
                class="col-span-3"
                variant="secondary"
                size="small"
              />
              <TextField
                value={newEndpointPath()}
                onChange={setNewEndpointPath}
                placeholder="/api/..."
                class="col-span-4"
              />
              <TextField
                value={newEndpointPurpose()}
                onChange={setNewEndpointPurpose}
                placeholder="Purpose"
                class="col-span-4"
              />
              <Button type="button" onClick={handleAddEndpoint} variant="secondary" class="col-span-1">
                <Icon name="plus" />
              </Button>
            </div>

            <div class="space-y-2">
              <For each={endpoints()}>
                {(endpoint) => (
                  <div class="flex items-center justify-between p-3 bg-surface-2 rounded-lg">
                    <div class="flex items-center gap-3">
                      <Tag>{endpoint.method}</Tag>
                      <code class="text-sm">{endpoint.path}</code>
                      <span class="text-sm text-text-weak">{endpoint.purpose}</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="small"
                      onClick={() => handleRemoveEndpoint(endpoint.id)}
                    >
                      <Icon name="close" />
                    </Button>
                  </div>
                )}
              </For>
              {endpoints().length === 0 && (
                <p class="text-sm text-text-weak text-center py-4">No endpoints defined yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div class="space-y-4">
        <h3 class="font-medium">Configuration</h3>

        <div class="grid grid-cols-2 gap-4">
          <Select
            current={auth()}
            onSelect={(v) => v && setAuth(v)}
            options={authOptions}
            value={(o: Option) => o.value}
            label={(o: Option) => o.label}
            variant="secondary"
            size="small"
          />

          <Select
            current={storage()}
            onSelect={(v) => v && setStorage(v)}
            options={storageOptions}
            value={(o: Option) => o.value}
            label={(o: Option) => o.label}
            variant="secondary"
            size="small"
          />
        </div>

        <Select
          current={expectedScale()}
          onSelect={(v) => v && setExpectedScale(v)}
          options={scaleOptions}
          value={(o: Option) => o.value}
          label={(o: Option) => o.label}
          variant="secondary"
          size="small"
        />

        <div class="flex gap-4">
          <div class="flex items-center space-x-2">
            <Checkbox id="rateLimiting" checked={rateLimiting()} onChange={setRateLimiting} />
            <span class="cursor-pointer">Rate Limiting</span>
          </div>
          <div class="flex items-center space-x-2">
            <Checkbox id="logging" checked={logging()} onChange={setLogging} />
            <span class="cursor-pointer">Request Logging</span>
          </div>
        </div>
      </div>

      <TextField
        value={successCriteria()}
        onChange={setSuccessCriteria}
        label="Success Criteria"
        placeholder="How will we know this backend is working correctly?"
        multiline
        rows={3}
      />

      <div class="flex justify-end gap-2 pt-4 border-t">
        <Button type="button" variant="ghost" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!appName().trim()}>
          <Icon name="prompt" />
          Create & Build
        </Button>
      </div>
    </form>
  )
}
