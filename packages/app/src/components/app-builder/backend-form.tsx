/**
 * Backend Form Component
 * Form for creating a new backend service
 */

import { createSignal, For } from 'solid-js'
import { Button } from '@openhei-ai/ui/button'
import { Input } from '@openhei-ai/ui/input'
import { Label } from '@openhei-ai/ui/label'
import { Textarea } from '@openhei-ai/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@openhei-ai/ui/select'
import { Checkbox } from '@openhei-ai/ui/checkbox'
import { Card, CardContent } from '@openhei-ai/ui/card'
import { Icon } from '@openhei-ai/ui/icon'
import type { BackendFormData, DataModelEntity, ApiEndpoint, DataModelField } from '@/types/app-builder'

interface BackendFormProps {
  onSubmit: (data: BackendFormData) => void
  onCancel: () => void
}

export function BackendForm(props: BackendFormProps) {
  const [appName, setAppName] = createSignal('')
  const [description, setDescription] = createSignal('')
  const [auth, setAuth] = createSignal<'none' | 'api-key' | 'jwt' | 'oauth'>('none')
  const [storage, setStorage] = createSignal<'in-memory' | 'sqlite' | 'json-file' | 'postgresql'>('in-memory')
  const [rateLimiting, setRateLimiting] = createSignal(false)
  const [logging, setLogging] = createSignal(true)
  const [expectedScale, setExpectedScale] = createSignal<'low' | 'medium' | 'high'>('low')
  const [successCriteria, setSuccessCriteria] = createSignal('')
  const [externalIntegrations, setExternalIntegrations] = createSignal<string[]>([])
  
  const [entities, setEntities] = createSignal<DataModelEntity[]>([])
  const [endpoints, setEndpoints] = createSignal<ApiEndpoint[]>([])
  
  const [newEntityName, setNewEntityName] = createSignal('')
  const [newEndpointPath, setNewEndpointPath] = createSignal('')
  const [newEndpointMethod, setNewEndpointMethod] = createSignal<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'>('GET')
  const [newEndpointPurpose, setNewEndpointPurpose] = createSignal('')

  const handleAddEntity = () => {
    if (!newEntityName().trim()) return
    const entity: DataModelEntity = {
      id: crypto.randomUUID(),
      name: newEntityName(),
      fields: [
        { id: crypto.randomUUID(), name: 'id', type: 'string', required: true },
      ],
      description: ''
    }
    setEntities([...entities(), entity])
    setNewEntityName('')
  }

  const handleRemoveEntity = (id: string) => {
    setEntities(entities().filter(e => e.id !== id))
  }

  const handleAddEndpoint = () => {
    if (!newEndpointPath().trim() || !newEndpointPurpose().trim()) return
    const endpoint: ApiEndpoint = {
      id: crypto.randomUUID(),
      path: newEndpointPath(),
      method: newEndpointMethod(),
      purpose: newEndpointPurpose()
    }
    setEndpoints([...endpoints(), endpoint])
    setNewEndpointPath('')
    setNewEndpointPurpose('')
  }

  const handleRemoveEndpoint = (id: string) => {
    setEndpoints(endpoints().filter(e => e.id !== id))
  }

  const handleSubmit = (e: Event) => {
    e.preventDefault()
    
    const data: BackendFormData = {
      appName: appName(),
      description: description(),
      dataModel: entities(),
      endpoints: endpoints(),
      auth: auth(),
      storage: storage(),
      externalIntegrations: externalIntegrations(),
      nonFunctionalReqs: {
        rateLimiting: rateLimiting(),
        logging: logging(),
        expectedScale: expectedScale()
      },
      successCriteria: successCriteria()
    }
    
    props.onSubmit(data)
  }

  return (
    <form onSubmit={handleSubmit} class="space-y-6">
      {/* Basic Info */}
      <div class="space-y-4">
        <h3 class="font-medium">Basic Information</h3>
        
        <div class="space-y-2">
          <Label for="appName">Application Name *</Label>
          <Input
            id="appName"
            value={appName()}
            onInput={(e) => setAppName(e.currentTarget.value)}
            placeholder="e.g., Tasks API"
            required
          />
        </div>

        <div class="space-y-2">
          <Label for="description">Description</Label>
          <Textarea
            id="description"
            value={description()}
            onInput={(e) => setDescription(e.currentTarget.value)}
            placeholder="What does this backend service do?"
            rows={3}
          />
        </div>
      </div>

      {/* Data Model */}
      <div class="space-y-4">
        <h3 class="font-medium">Data Model</h3>
        
        <Card>
          <CardContent class="pt-4 space-y-4">
            <div class="flex gap-2">
              <Input
                value={newEntityName()}
                onInput={(e) => setNewEntityName(e.currentTarget.value)}
                placeholder="Entity name (e.g., Task, User)"
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddEntity())}
              />
              <Button type="button" onClick={handleAddEntity} variant="secondary">
                <Icon name="plus" class="w-4 h-4" />
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
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleRemoveEntity(entity.id)}
                    >
                      <Icon name="x" class="w-4 h-4" />
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

      {/* API Endpoints */}
      <div class="space-y-4">
        <h3 class="font-medium">API Endpoints</h3>
        
        <Card>
          <CardContent class="pt-4 space-y-4">
            <div class="grid grid-cols-12 gap-2">
              <Select value={newEndpointMethod()} onValueChange={(v) => setNewEndpointMethod(v as any)}>
                <SelectTrigger class="col-span-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                  <SelectItem value="PATCH">PATCH</SelectItem>
                  <SelectItem value="DELETE">DELETE</SelectItem>
                </SelectContent>
              </Select>
              <Input
                class="col-span-4"
                value={newEndpointPath()}
                onInput={(e) => setNewEndpointPath(e.currentTarget.value)}
                placeholder="/api/..."
              />
              <Input
                class="col-span-4"
                value={newEndpointPurpose()}
                onInput={(e) => setNewEndpointPurpose(e.currentTarget.value)}
                placeholder="Purpose"
              />
              <Button 
                type="button" 
                onClick={handleAddEndpoint} 
                variant="secondary"
                class="col-span-1"
              >
                <Icon name="plus" class="w-4 h-4" />
              </Button>
            </div>

            <div class="space-y-2">
              <For each={endpoints()}>
                {(endpoint) => (
                  <div class="flex items-center justify-between p-3 bg-surface-2 rounded-lg">
                    <div class="flex items-center gap-3">
                      <Badge variant="secondary">{endpoint.method}</Badge>
                      <code class="text-sm">{endpoint.path}</code>
                      <span class="text-sm text-text-weak">{endpoint.purpose}</span>
                    </div>
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleRemoveEndpoint(endpoint.id)}
                    >
                      <Icon name="x" class="w-4 h-4" />
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

      {/* Configuration */}
      <div class="space-y-4">
        <h3 class="font-medium">Configuration</h3>
        
        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <Label>Authentication</Label>
            <Select value={auth()} onValueChange={(v) => setAuth(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="api-key">API Key</SelectItem>
                <SelectItem value="jwt">JWT</SelectItem>
                <SelectItem value="oauth">OAuth 2.0</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="space-y-2">
            <Label>Storage</Label>
            <Select value={storage()} onValueChange={(v) => setStorage(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in-memory">In-Memory</SelectItem>
                <SelectItem value="json-file">JSON File</SelectItem>
                <SelectItem value="sqlite">SQLite</SelectItem>
                <SelectItem value="postgresql">PostgreSQL</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div class="space-y-2">
          <Label>Expected Scale</Label>
          <Select value={expectedScale()} onValueChange={(v) => setExpectedScale(v as any)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low (personal/small team)</SelectItem>
              <SelectItem value="medium">Medium (growing product)</SelectItem>
              <SelectItem value="high">High (enterprise scale)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="flex gap-4">
          <div class="flex items-center space-x-2">
            <Checkbox 
              id="rateLimiting" 
              checked={rateLimiting()} 
              onChange={setRateLimiting}
            />
            <Label for="rateLimiting" class="cursor-pointer">Rate Limiting</Label>
          </div>
          <div class="flex items-center space-x-2">
            <Checkbox 
              id="logging" 
              checked={logging()} 
              onChange={setLogging}
            />
            <Label for="logging" class="cursor-pointer">Request Logging</Label>
          </div>
        </div>
      </div>

      {/* Success Criteria */}
      <div class="space-y-2">
        <Label for="successCriteria">Success Criteria</Label>
        <Textarea
          id="successCriteria"
          value={successCriteria()}
          onInput={(e) => setSuccessCriteria(e.currentTarget.value)}
          placeholder="How will we know this backend is working correctly?"
          rows={3}
        />
      </div>

      {/* Actions */}
      <div class="flex justify-end gap-2 pt-4 border-t">
        <Button type="button" variant="outline" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!appName().trim()}>
          <Icon name="play" class="w-4 h-4 mr-2" />
          Create & Build
        </Button>
      </div>
    </form>
  )
}

// Need to import Badge
import { Badge } from '@openhei-ai/ui/badge'
