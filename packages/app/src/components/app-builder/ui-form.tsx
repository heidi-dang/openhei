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
      {/* Basic Info */}
      <div class="space-y-4">
        <h3 class="font-medium">Basic Information</h3>

        <div class="space-y-2">
          <TextField
            label="Application Name *"
            value={appName()}
            onInput={(e) => setAppName(e.currentTarget.value)}
            placeholder="e.g., Task Manager"
            required
          />
        </div>

        <div class="space-y-2">
          <TextField
            label="Target Users"
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
              <TextField
                class="col-span-4"
                value={newPageName()}
                onInput={(e) => setNewPageName(e.currentTarget.value)}
                placeholder="Page name"
              />
              <TextField
                class="col-span-3"
                value={newPageRoute()}
                onInput={(e) => setNewPageRoute(e.currentTarget.value)}
                placeholder="/route"
              />
              <TextField
                class="col-span-4"
                value={newPageDescription()}
                onInput={(e) => setNewPageDescription(e.currentTarget.value)}
                placeholder="Description (optional)"
              />
              <Button type="button" onClick={handleAddPage} variant="secondary" class="col-span-1">
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
                      {page.description && <span class="text-sm text-text-weak">- {page.description}</span>}
                    </div>
                    <Button type="button" variant="ghost" size="small" onClick={() => handleRemovePage(page.id)}>
                      <Icon name="close" class="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </For>
              {pages().length === 0 && <p class="text-sm text-text-weak text-center py-4">No pages defined yet</p>}
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
              <Select
                class="col-span-3"
                options={componentTypeOptions}
                current={componentTypeOptions.find((o) => o.value === newComponentType())}
                value={(o) => o.value}
                label={(o) => o.label}
                onSelect={(o) => o && setNewComponentType(o.value)}
              />
              <TextField
                class="col-span-8"
                value={newComponentDescription()}
                onInput={(e) => setNewComponentDescription(e.currentTarget.value)}
                placeholder="Component description"
              />
              <Button type="button" onClick={handleAddComponent} variant="secondary" class="col-span-1">
                <Icon name="plus" class="w-4 h-4" />
              </Button>
            </div>

            <div class="space-y-2">
              <For each={components()}>
                {(component) => (
                  <div class="flex items-center justify-between p-3 bg-surface-2 rounded-lg">
                    <div class="flex items-center gap-3">
                      <Tag>{componentTypeLabels[component.type]}</Tag>
                      <span class="text-sm">{component.description}</span>
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
              <TextField
                value={newFlowAction()}
                onInput={(e) => setNewFlowAction(e.currentTarget.value)}
                placeholder="User action (e.g., Click login button)"
              />
              <TextField
                value={newFlowResponse()}
                onInput={(e) => setNewFlowResponse(e.currentTarget.value)}
                placeholder="System response (e.g., Show login form)"
              />
              <TextField
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
                      <Tag>Step {index() + 1}</Tag>
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
          <Checkbox id="inheritTheme" checked={inheritTheme()} onChange={setInheritTheme} />
          <label for="inheritTheme" class="cursor-pointer">
            Inherit OpenHei theme
          </label>
        </div>

        <Show when={!inheritTheme()}>
          <div class="space-y-2">
            <TextField
              label="Primary Color (optional)"
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
            <Checkbox id="mobileSafe" checked={mobileSafe()} onChange={setMobileSafe} />
            <label for="mobileSafe" class="cursor-pointer">
              Mobile Responsive
            </label>
          </div>
          <div class="flex items-center space-x-2">
            <Checkbox id="keyboardNav" checked={keyboardNav()} onChange={setKeyboardNav} />
            <label for="keyboardNav" class="cursor-pointer">
              Keyboard Navigation
            </label>
          </div>
          <div class="flex items-center space-x-2">
            <Checkbox id="screenReader" checked={screenReader()} onChange={setScreenReader} />
            <label for="screenReader" class="cursor-pointer">
              Screen Reader Support
            </label>
          </div>
        </div>
      </div>

      {/* Success Criteria */}
      <div class="space-y-2">
        <TextField
          label="Success Criteria"
          value={successCriteria()}
          onInput={(e) => setSuccessCriteria(e.currentTarget.value)}
          placeholder="How will we know this UI is working correctly?"
        />
      </div>

      {/* Actions */}
      <div class="flex justify-end gap-2 pt-4 border-t">
        <Button type="button" variant="ghost" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={!appName().trim()}>
          <Icon name="prompt" class="w-4 h-4 mr-2" />
          Create & Build
        </Button>
      </div>
    </form>
  )
}
