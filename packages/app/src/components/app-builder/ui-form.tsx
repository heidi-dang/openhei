/**
 * UI Form Component
 * Form for creating a new frontend UI
 */

import { createSignal, For, Show } from "solid-js"
import { Button } from "@openhei-ai/ui/button"
import { TextField } from "@openhei-ai/ui/text-field"
import { Select } from "@openhei-ai/ui/select"
import { Checkbox } from "@openhei-ai/ui/checkbox"
import { Card, CardContent } from "@openhei-ai/ui/card"
import { Tag } from "@openhei-ai/ui/tag"
import { Icon } from "@openhei-ai/ui/icon"
import type { UIFormData, UIPage, UIComponent, UserFlowStep } from "@/types/app-builder"

interface UIFormProps {
  onSubmit: (data: UIFormData) => void
  onCancel: () => void
}

export function UIForm(props: UIFormProps) {
  const [appName, setAppName] = createSignal("")
  const [targetUsers, setTargetUsers] = createSignal("")
  const [inheritTheme, setInheritTheme] = createSignal(true)
  const [primaryColor, setPrimaryColor] = createSignal("")
  const [mobileSafe, setMobileSafe] = createSignal(true)
  const [keyboardNav, setKeyboardNav] = createSignal(true)
  const [screenReader, setScreenReader] = createSignal(true)
  const [successCriteria, setSuccessCriteria] = createSignal("")

  const [pages, setPages] = createSignal<UIPage[]>([])
  const [components, setComponents] = createSignal<UIComponent[]>([])
  const [userFlows, setUserFlows] = createSignal<UserFlowStep[]>([])

  const [newPageName, setNewPageName] = createSignal("")
  const [newPageRoute, setNewPageRoute] = createSignal("")
  const [newPageDescription, setNewPageDescription] = createSignal("")
  const [newComponentType, setNewComponentType] = createSignal<UIComponent["type"]>("form")
  const [newComponentDescription, setNewComponentDescription] = createSignal("")
  const [newFlowAction, setNewFlowAction] = createSignal("")
  const [newFlowResponse, setNewFlowResponse] = createSignal("")
  const [newFlowResult, setNewFlowResult] = createSignal("")

  const handleAddPage = () => {
    if (!newPageName().trim() || !newPageRoute().trim()) return
    const page: UIPage = {
      id: crypto.randomUUID(),
      name: newPageName(),
      route: newPageRoute(),
      description: newPageDescription(),
    }
    setPages([...pages(), page])
    setNewPageName("")
    setNewPageRoute("")
    setNewPageDescription("")
  }

  const handleRemovePage = (id: string) => {
    setPages(pages().filter((p) => p.id !== id))
  }

  const handleAddComponent = () => {
    if (!newComponentDescription().trim()) return
    const component: UIComponent = {
      id: crypto.randomUUID(),
      type: newComponentType(),
      description: newComponentDescription(),
    }
    setComponents([...components(), component])
    setNewComponentDescription("")
  }

  const handleRemoveComponent = (id: string) => {
    setComponents(components().filter((c) => c.id !== id))
  }

  const handleAddFlow = () => {
    if (!newFlowAction().trim() || !newFlowResponse().trim()) return
    const flow: UserFlowStep = {
      id: crypto.randomUUID(),
      userAction: newFlowAction(),
      systemResponse: newFlowResponse(),
      result: newFlowResult(),
    }
    setUserFlows([...userFlows(), flow])
    setNewFlowAction("")
    setNewFlowResponse("")
    setNewFlowResult("")
  }

  const handleRemoveFlow = (id: string) => {
    setUserFlows(userFlows().filter((f) => f.id !== id))
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
        screenReader: screenReader(),
      },
      successCriteria: successCriteria(),
    }

    props.onSubmit(data)
  }

  const componentTypeLabels: Record<UIComponent["type"], string> = {
    form: "Form",
    table: "Table",
    chart: "Chart",
    chat: "Chat",
    modal: "Modal",
    card: "Card",
    navigation: "Navigation",
    other: "Other",
  }

  const componentTypeOptions = Object.entries(componentTypeLabels).map(([value, label]) => ({
    value: value as UIComponent["type"],
    label,
  }))

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
        <p class="text-sm text-text-weak -mt-2 ml-8">Name your app and describe your target users</p>

        <TextField
          label="Application Name *"
          value={appName()}
          onChange={setAppName}
          placeholder="e.g., Task Manager"
          required
        />

        <TextField
          label="Target Users"
          value={targetUsers()}
          onChange={setTargetUsers}
          placeholder="Who will use this application?"
        />
      </div>

      {/* Step 2: Pages */}
      <div class="space-y-4">
        <div class="flex items-center gap-2 mb-2">
          <span class="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
            2
          </span>
          <h3 class="font-medium">Pages</h3>
        </div>
        <p class="text-sm text-text-weak -mt-2 ml-8">Define the pages in your application</p>

        <Card>
          <CardContent class="pt-4 space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <TextField
                class="sm:col-span-4"
                value={newPageName()}
                onChange={setNewPageName}
                placeholder="Page name"
              />
              <TextField class="sm:col-span-3" value={newPageRoute()} onChange={setNewPageRoute} placeholder="/route" />
              <TextField
                class="sm:col-span-4"
                value={newPageDescription()}
                onChange={setNewPageDescription}
                placeholder="Description (optional)"
              />
              <Button type="button" onClick={handleAddPage} variant="secondary" class="sm:col-span-1 w-full">
                <Icon name="plus" class="w-4 h-4" />
              </Button>
            </div>

            <div class="space-y-2">
              <For each={pages()}>
                {(page) => (
                  <div class="flex items-center justify-between p-3 bg-surface-2 rounded-lg">
                    <div class="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                      <span class="font-medium truncate">{page.name}</span>
                      <code class="text-sm text-text-weak truncate hidden sm:inline">{page.route}</code>
                      {page.description && (
                        <span class="text-sm text-text-weak hidden md:inline truncate">- {page.description}</span>
                      )}
                    </div>
                    <Button type="button" variant="ghost" size="small" onClick={() => handleRemovePage(page.id)}>
                      <Icon name="close" class="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </For>
              {pages().length === 0 && (
                <p class="text-sm text-text-weak text-center py-4">No pages defined yet. Add one above.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Step 3: Components */}
      <div class="space-y-4">
        <div class="flex items-center gap-2 mb-2">
          <span class="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
            3
          </span>
          <h3 class="font-medium">Components</h3>
        </div>
        <p class="text-sm text-text-weak -mt-2 ml-8">Add reusable UI components</p>

        <Card>
          <CardContent class="pt-4 space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <Select
                class="sm:col-span-3"
                value={newComponentType()}
                onChange={(v) => v && setNewComponentType(v)}
                options={componentTypeOptions.map((o) => o.value)}
                placeholder="Type"
              />
              <TextField
                class="sm:col-span-8"
                value={newComponentDescription()}
                onChange={setNewComponentDescription}
                placeholder="Component description"
              />
              <Button type="button" onClick={handleAddComponent} variant="secondary" class="sm:col-span-1 w-full">
                <Icon name="plus" class="w-4 h-4" />
              </Button>
            </div>

            <div class="space-y-2">
              <For each={components()}>
                {(component) => (
                  <div class="flex items-center justify-between p-3 bg-surface-2 rounded-lg">
                    <div class="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                      <Tag class="flex-shrink-0 text-xs">{componentTypeLabels[component.type]}</Tag>
                      <span class="text-sm truncate">{component.description}</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="small"
                      onClick={() => handleRemoveComponent(component.id)}
                    >
                      <Icon name="close" class="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </For>
              {components().length === 0 && (
                <p class="text-sm text-text-weak text-center py-4">No components defined yet. Add one above.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Step 4: User Flows */}
      <div class="space-y-4">
        <div class="flex items-center gap-2 mb-2">
          <span class="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
            4
          </span>
          <h3 class="font-medium">User Flows</h3>
        </div>
        <p class="text-sm text-text-weak -mt-2 ml-8">Describe how users interact with your app</p>

        <Card>
          <CardContent class="pt-4 space-y-4">
            <div class="space-y-2">
              <TextField
                value={newFlowAction()}
                onChange={setNewFlowAction}
                placeholder="User action (e.g., Click login button)"
              />
              <TextField
                value={newFlowResponse()}
                onChange={setNewFlowResponse}
                placeholder="System response (e.g., Show login form)"
              />
              <TextField value={newFlowResult()} onChange={setNewFlowResult} placeholder="Result (optional)" />
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
                      <Tag class="text-xs">Step {index() + 1}</Tag>
                      <Button type="button" variant="ghost" size="small" onClick={() => handleRemoveFlow(flow.id)}>
                        <Icon name="close" class="w-4 h-4" />
                      </Button>
                    </div>
                    <div class="mt-2 text-sm space-y-1">
                      <p>
                        <span class="text-text-weak">Action:</span> {flow.userAction}
                      </p>
                      <p>
                        <span class="text-text-weak">Response:</span> {flow.systemResponse}
                      </p>
                      {flow.result && (
                        <p>
                          <span class="text-text-weak">Result:</span> {flow.result}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </For>
              {userFlows().length === 0 && (
                <p class="text-sm text-text-weak text-center py-4">No user flows defined yet. Add one above.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Step 5: Brand & Accessibility */}
      <div class="space-y-4">
        <div class="flex items-center gap-2 mb-2">
          <span class="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
            5
          </span>
          <h3 class="font-medium">Brand & Accessibility</h3>
        </div>
        <p class="text-sm text-text-weak -mt-2 ml-8">Customize the look and accessibility features</p>

        <div class="flex items-center space-x-2">
          <Checkbox id="inheritTheme" checked={inheritTheme()} onChange={setInheritTheme} />
          <label for="inheritTheme" class="cursor-pointer text-sm">
            Inherit OpenHei theme
          </label>
        </div>

        <Show when={!inheritTheme()}>
          <div class="space-y-2">
            <TextField
              label="Primary Color (optional)"
              value={primaryColor()}
              onChange={setPrimaryColor}
              placeholder="#3b82f6 or blue-500"
            />
          </div>
        </Show>

        <div class="flex flex-wrap gap-4">
          <div class="flex items-center space-x-2">
            <Checkbox id="mobileSafe" checked={mobileSafe()} onChange={setMobileSafe} />
            <label for="mobileSafe" class="cursor-pointer text-sm">
              Mobile Responsive
            </label>
          </div>
          <div class="flex items-center space-x-2">
            <Checkbox id="keyboardNav" checked={keyboardNav()} onChange={setKeyboardNav} />
            <label for="keyboardNav" class="cursor-pointer text-sm">
              Keyboard Navigation
            </label>
          </div>
          <div class="flex items-center space-x-2">
            <Checkbox id="screenReader" checked={screenReader()} onChange={setScreenReader} />
            <label for="screenReader" class="cursor-pointer text-sm">
              Screen Reader Support
            </label>
          </div>
        </div>
      </div>

      {/* Step 6: Success Criteria */}
      <div class="space-y-4">
        <div class="flex items-center gap-2 mb-2">
          <span class="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
            6
          </span>
          <h3 class="font-medium">Success Criteria</h3>
        </div>
        <p class="text-sm text-text-weak -mt-2 ml-8">How will we know this UI is working correctly?</p>

        <TextField
          value={successCriteria()}
          onChange={setSuccessCriteria}
          placeholder="e.g., Users can complete the main task in under 3 clicks"
        />
      </div>

      {/* Actions */}
      <div class="flex flex-col sm:flex-row justify-end gap-2 pt-4 border-t">
        <Button type="button" variant="ghost" onClick={props.onCancel} class="w-full sm:w-auto">
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={!appName().trim()} class="w-full sm:w-auto">
          <Icon name="prompt" class="w-4 h-4 mr-2" />
          Create & Build
        </Button>
      </div>
    </form>
  )
}
