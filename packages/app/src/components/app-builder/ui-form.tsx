/**
 * UI Form Component
 * Form for creating a new frontend UI
 */

import { createSignal, For } from 'solid-js'
import { Button } from '@openhei-ai/ui/button'
import { Input } from '@openhei-ai/ui/input'
import { Label } from '@openhei-ai/ui/label'
import { Textarea } from '@openhei-ai/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@openhei-ai/ui/select'
import { Checkbox } from '@openhei-ai/ui/checkbox'
import { Card, CardContent } from '@openhei-ai/ui/card'
import { Badge } from '@openhei-ai/ui/badge'
import { Icon } from '@openhei-ai/ui/icon'
import type { UIFormData, UIPage, UIComponent, UserFlowStep } from '@/types/app-builder'

interface UIFormProps {
  onSubmit: (data: UIFormData) => void
  onCancel: () => void
}

export function UIForm(props: UIFormProps) {
  const [appName, setAppName] = createSignal('')
  const [targetUsers, setTargetUsers] = createSignal('')
  const [inheritTheme, setInheritTheme] = createSignal(true)
  const [primaryColor, setPrimaryColor] = createSignal('')
  const [mobileSafe, setMobileSafe] = createSignal(true)
  const [keyboardNav, setKeyboardNav] = createSignal(true)
  const [screenReader, setScreenReader] = createSignal(true)
  const [successCriteria, setSuccessCriteria] = createSignal('')
  
  const [pages, setPages] = createSignal<UIPage[]>([])
  const [components, setComponents] = createSignal<UIComponent[]>([])
  const [userFlows, setUserFlows] = createSignal<UserFlowStep[]>([])
  
  const [newPageName, setNewPageName] = createSignal('')
  const [newPageRoute, setNewPageRoute] = createSignal('')
  const [newPageDescription, setNewPageDescription] = createSignal('')
  const [newComponentType, setNewComponentType] = createSignal<UIComponent['type']>('form')
  const [newComponentDescription, setNewComponentDescription] = createSignal('')
  const [newFlowAction, setNewFlowAction] = createSignal('')
  const [newFlowResponse, setNewFlowResponse] = createSignal('')
  const [newFlowResult, setNewFlowResult] = createSignal('')

  const handleAddPage = () => {
    if (!newPageName().trim() || !newPageRoute().trim()) return
    const page: UIPage = {
      id: crypto.randomUUID(),
      name: newPageName(),
      route: newPageRoute(),
      description: newPageDescription()
    }
    setPages([...pages(), page])
    setNewPageName('')
    setNewPageRoute('')
    setNewPageDescription('')
  }

  const handleRemovePage = (id: string) => {
    setPages(pages().filter(p => p.id !== id))
  }

  const handleAddComponent = () => {
    if (!newComponentDescription().trim()) return
    const component: UIComponent = {
      id: crypto.randomUUID(),
      type: newComponentType(),
      description: newComponentDescription()
    }
    setComponents([...components(), component])
    setNewComponentDescription('')
  }

  const handleRemoveComponent = (id: string) => {
    setComponents(components().filter(c => c.id !== id))
  }

  const handleAddFlow = () => {
    if (!newFlowAction().trim() || !newFlowResponse().trim()) return
    const flow: UserFlowStep = {
      id: crypto.randomUUID(),
      userAction: newFlowAction(),
      systemResponse: newFlowResponse(),
      result: newFlowResult()
    }
    setUserFlows([...userFlows(), flow])
    setNewFlowAction('')
    setNewFlowResponse('')
    setNewFlowResult('')
  }

  const handleRemoveFlow = (id: string) => {
    setUserFlows(userFlows().filter(f => f.id !== id))
  }

  const handleSubmit = (e: Event) => {
    e.preventDefault()
    
    const data: UIFormData = {
      appName: appName(),
      targetUsers: targetUsers(),
      pages: pages(),
      components: components(),
      userFlows: userFlows(),
      brandStyle: {
        inheritTheme: inheritTheme(),
        primaryColor: primaryColor() || undefined,
      },
      accessibility: {
        mobileSafe: mobileSafe(),
        keyboardNav: keyboardNav(),
        screenReader: screenReader()
      },
      successCriteria: successCriteria()
    }
    
    props.onSubmit(data)
  }

  const componentTypeLabels: Record<UIComponent['type'], string> = {
    form: 'Form',
    table: 'Table',
    chart: 'Chart',
    chat: 'Chat',
    modal: 'Modal',
    card: 'Card',
    navigation: 'Navigation',
    other: 'Other'
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
            placeholder="e.g., Task Manager"
            required
          />
        </div>

        <div class="space-y-2">
          <Label for="targetUsers">Target Users</Label>
          <Input
            id="targetUsers"
            value={targetUsers()}
            onInput={(e) => setTargetUsers(e.currentTarget.value)}
            placeholder="Who will use this application?"
          />
        </div>
      </div>

      {/* Pages */}
      <div class="space-y-4">
        <h3 class="font-medium">Pages</h3>
        
        <Card>
          <CardContent class="pt-4 space-y-4">
            <div class="grid grid-cols-12 gap-2">
              <Input
                class="col-span-4"
                value={newPageName()}
                onInput={(e) => setNewPageName(e.currentTarget.value)}
                placeholder="Page name"
              />
              <Input
                class="col-span-3"
                value={newPageRoute()}
                onInput={(e) => setNewPageRoute(e.currentTarget.value)}
                placeholder="/route"
              />
              <Input
                class="col-span-4"
                value={newPageDescription()}
                onInput={(e) => setNewPageDescription(e.currentTarget.value)}
                placeholder="Description (optional)"
              />
              <Button 
                type="button" 
                onClick={handleAddPage} 
                variant="secondary"
                class="col-span-1"
              >
                <Icon name="plus" class="w-4 h-4" />
              </Button>
            </div>

            <div class="space-y-2">
              <For each={pages()}>
                {(page) => (
                  <div class="flex items-center justify-between p-3 bg-surface-2 rounded-lg">
                    <div class="flex items-center gap-3">
                      <span class="font-medium">{page.name}</span>
                      <code class="text-sm text-text-weak">{page.route}</code>
                      {page.description && (
                        <span class="text-sm text-text-weak">- {page.description}</span>
                      )}
                    </div>
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleRemovePage(page.id)}
                    >
                      <Icon name="x" class="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </For>
              {pages().length === 0 && (
                <p class="text-sm text-text-weak text-center py-4">No pages defined yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Components */}
      <div class="space-y-4">
        <h3 class="font-medium">Components</h3>
        
        <Card>
          <CardContent class="pt-4 space-y-4">
            <div class="grid grid-cols-12 gap-2">
              <Select value={newComponentType()} onValueChange={(v) => setNewComponentType(v as any)}>
                <SelectTrigger class="col-span-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <For each={Object.entries(componentTypeLabels)}>
                    {([value, label]) => (
                      <SelectItem value={value}>{label}</SelectItem>
                    )}
                  </For>
                </SelectContent>
              </Select>
              <Input
                class="col-span-8"
                value={newComponentDescription()}
                onInput={(e) => setNewComponentDescription(e.currentTarget.value)}
                placeholder="Component description"
              />
              <Button 
                type="button" 
                onClick={handleAddComponent} 
                variant="secondary"
                class="col-span-1"
              >
                <Icon name="plus" class="w-4 h-4" />
              </Button>
            </div>

            <div class="space-y-2">
              <For each={components()}>
                {(component) => (
                  <div class="flex items-center justify-between p-3 bg-surface-2 rounded-lg">
                    <div class="flex items-center gap-3">
                      <Badge variant="secondary">{componentTypeLabels[component.type]}</Badge>
                      <span class="text-sm">{component.description}</span>
                    </div>
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleRemoveComponent(component.id)}
                    >
                      <Icon name="x" class="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </For>
              {components().length === 0 && (
                <p class="text-sm text-text-weak text-center py-4">No components defined yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* User Flows */}
      <div class="space-y-4">
        <h3 class="font-medium">User Flows</h3>
        
        <Card>
          <CardContent class="pt-4 space-y-4">
            <div class="space-y-2">
              <Input
                value={newFlowAction()}
                onInput={(e) => setNewFlowAction(e.currentTarget.value)}
                placeholder="User action (e.g., Click login button)"
              />
              <Input
                value={newFlowResponse()}
                onInput={(e) => setNewFlowResponse(e.currentTarget.value)}
                placeholder="System response (e.g., Show login form)"
              />
              <Input
                value={newFlowResult()}
                onInput={(e) => setNewFlowResult(e.currentTarget.value)}
                placeholder="Result (optional)"
              />
              <Button type="button" onClick={handleAddFlow} variant="secondary" class="w-full">
                <Icon name="plus" class="w-4 h-4 mr-2" />
                Add Flow Step
              </Button>
            </div>

            <div class="space-y-2">
              <For each={userFlows()}>
                {(flow, index) => (
                  <div class="p-3 bg-surface-2 rounded-lg">
                    <div class="flex items-center justify-between">
                      <Badge variant="outline">Step {index() + 1}</Badge>
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleRemoveFlow(flow.id)}
                      >
                        <Icon name="x" class="w-4 h-4" />
                      </Button>
                    </div>
                    <div class="mt-2 text-sm space-y-1">
                      <p><span class="text-text-weak">Action:</span> {flow.userAction}</p>
                      <p><span class="text-text-weak">Response:</span> {flow.systemResponse}</p>
                      {flow.result && <p><span class="text-text-weak">Result:</span> {flow.result}</p>}
                    </div>
                  </div>
                )}
              </For>
              {userFlows().length === 0 && (
                <p class="text-sm text-text-weak text-center py-4">No user flows defined yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Brand Style */}
      <div class="space-y-4">
        <h3 class="font-medium">Brand Style</h3>
        
        <div class="flex items-center space-x-2">
          <Checkbox 
            id="inheritTheme" 
            checked={inheritTheme()} 
            onChange={setInheritTheme}
          />
          <Label for="inheritTheme" class="cursor-pointer">Inherit OpenHei theme</Label>
        </div>

        <Show when={!inheritTheme()}>
          <div class="space-y-2">
            <Label for="primaryColor">Primary Color (optional)</Label>
            <Input
              id="primaryColor"
              value={primaryColor()}
              onInput={(e) => setPrimaryColor(e.currentTarget.value)}
              placeholder="#3b82f6 or blue-500"
            />
          </div>
        </Show>
      </div>

      {/* Accessibility */}
      <div class="space-y-4">
        <h3 class="font-medium">Accessibility</h3>
        
        <div class="flex flex-wrap gap-4">
          <div class="flex items-center space-x-2">
            <Checkbox 
              id="mobileSafe" 
              checked={mobileSafe()} 
              onChange={setMobileSafe}
            />
            <Label for="mobileSafe" class="cursor-pointer">Mobile Responsive</Label>
          </div>
          <div class="flex items-center space-x-2">
            <Checkbox 
              id="keyboardNav" 
              checked={keyboardNav()} 
              onChange={setKeyboardNav}
            />
            <Label for="keyboardNav" class="cursor-pointer">Keyboard Navigation</Label>
          </div>
          <div class="flex items-center space-x-2">
            <Checkbox 
              id="screenReader" 
              checked={screenReader()} 
              onChange={setScreenReader}
            />
            <Label for="screenReader" class="cursor-pointer">Screen Reader Support</Label>
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
          placeholder="How will we know this UI is working correctly?"
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
