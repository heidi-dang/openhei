/**
 * App Builder Types
 * Type definitions for the OpenHei App Builder feature
 */

// Build Session Status
export type BuildStatus = 
  | 'queued' 
  | 'planning' 
  | 'scaffolding' 
  | 'implementing' 
  | 'validating'
  | 'running' 
  | 'ready' 
  | 'failed'
  | 'stopped'

export type BuildPhase = 
  | 'plan'
  | 'scaffold'
  | 'implement'
  | 'validate'
  | 'run-backend'
  | 'run-frontend'
  | 'ready'

export interface BuildPhaseInfo {
  id: BuildPhase
  label: string
  description: string
  status: 'pending' | 'in-progress' | 'completed' | 'failed'
  startedAt?: number
  completedAt?: number
}

// API Endpoint Definition
export interface ApiEndpoint {
  id: string
  path: string
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  purpose: string
}

// Data Model Field
export interface DataModelField {
  id: string
  name: string
  type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object'
  required: boolean
  description?: string
}

// Data Model Entity
export interface DataModelEntity {
  id: string
  name: string
  fields: DataModelField[]
  description?: string
}

// Backend Form Data
export interface BackendFormData {
  appName: string
  description: string
  dataModel: DataModelEntity[]
  endpoints: ApiEndpoint[]
  auth: 'none' | 'api-key' | 'jwt' | 'oauth'
  storage: 'in-memory' | 'sqlite' | 'json-file' | 'postgresql'
  externalIntegrations: string[]
  nonFunctionalReqs: {
    rateLimiting: boolean
    logging: boolean
    expectedScale: 'low' | 'medium' | 'high'
  }
  successCriteria: string
}

// UI Page Definition
export interface UIPage {
  id: string
  name: string
  route: string
  description?: string
}

// UI Component Definition
export interface UIComponent {
  id: string
  type: 'form' | 'table' | 'chart' | 'chat' | 'modal' | 'card' | 'navigation' | 'other'
  description: string
}

// User Flow Step
export interface UserFlowStep {
  id: string
  userAction: string
  systemResponse: string
  result: string
}

// UI Form Data
export interface UIFormData {
  appName: string
  targetUsers: string
  pages: UIPage[]
  components: UIComponent[]
  userFlows: UserFlowStep[]
  brandStyle: {
    inheritTheme: boolean
    primaryColor?: string
    customStyles?: string
  }
  accessibility: {
    mobileSafe: boolean
    keyboardNav: boolean
    screenReader: boolean
  }
  successCriteria: string
}

// Repo Import Form Data
export interface RepoImportFormData {
  repoUrl: string
  buildInstructions: string
  preserveFiles: string
  runCommand: string
  definitionOfDone: string
  generateTarget: 'backend' | 'ui' | 'both'
}

// Creation Mode
export type CreationMode = 'backend' | 'ui' | 'repo'

// Build Session (matches server-side job)
export interface BuildSession {
  id: string
  name: string
  mode: CreationMode
  status: BuildStatus
  currentPhase: BuildPhase | null
  phases: BuildPhaseInfo[]
  formData: Record<string, unknown>
  workspacePath: string
  sandboxMode: 'docker' | 'host'
  createdAt: number
  updatedAt: number
  
  // Runtime info
  backend?: {
    port: number
    pid?: number
    containerId?: string
    status: 'starting' | 'running' | 'stopped' | 'error'
    healthCheck?: boolean
    lastHealthCheck?: number
    restartCount?: number
  }
  frontend?: {
    port: number
    pid?: number
    containerId?: string
    status: 'starting' | 'running' | 'stopped' | 'error'
    restartCount?: number
  }
  
  // URLs
  previewUrl?: string
  backendUrl?: string
  
  // Error info
  error?: {
    phase: BuildPhase
    message: string
    command?: string
    exitCode?: number
    timestamp: number
  }
}

// Build Log Entry
export interface BuildLog {
  timestamp: number
  level: 'info' | 'warn' | 'error' | 'success'
  message: string
  phase?: BuildPhase
  metadata?: Record<string, unknown>
}

// Sample App
export const sampleTasksApp = {
  backend: (): BackendFormData => ({
    appName: 'Tasks API',
    description: 'A simple CRUD API for managing tasks',
    dataModel: [
      {
        id: crypto.randomUUID(),
        name: 'Task',
        fields: [
          { id: crypto.randomUUID(), name: 'id', type: 'string', required: true },
          { id: crypto.randomUUID(), name: 'title', type: 'string', required: true },
          { id: crypto.randomUUID(), name: 'description', type: 'string', required: false },
          { id: crypto.randomUUID(), name: 'completed', type: 'boolean', required: true },
          { id: crypto.randomUUID(), name: 'createdAt', type: 'date', required: true }
        ]
      }
    ],
    endpoints: [
      { id: crypto.randomUUID(), path: '/api/health', method: 'GET', purpose: 'Health check' },
      { id: crypto.randomUUID(), path: '/api/tasks', method: 'GET', purpose: 'List all tasks' },
      { id: crypto.randomUUID(), path: '/api/tasks', method: 'POST', purpose: 'Create a new task' },
      { id: crypto.randomUUID(), path: '/api/tasks/:id', method: 'GET', purpose: 'Get a specific task' },
      { id: crypto.randomUUID(), path: '/api/tasks/:id', method: 'PUT', purpose: 'Update a task' },
      { id: crypto.randomUUID(), path: '/api/tasks/:id', method: 'DELETE', purpose: 'Delete a task' }
    ],
    auth: 'none',
    storage: 'in-memory',
    externalIntegrations: [],
    nonFunctionalReqs: { rateLimiting: false, logging: true, expectedScale: 'low' },
    successCriteria: 'All CRUD operations work correctly via the API endpoints'
  }),
  
  ui: (): UIFormData => ({
    appName: 'Tasks Manager',
    targetUsers: 'Individual users managing personal tasks',
    pages: [
      { id: crypto.randomUUID(), name: 'Home', route: '/', description: 'Task list view' },
      { id: crypto.randomUUID(), name: 'Add Task', route: '/add', description: 'Form to add new task' }
    ],
    components: [
      { id: crypto.randomUUID(), type: 'table', description: 'Task list with sortable columns' },
      { id: crypto.randomUUID(), type: 'form', description: 'Task creation/editing form' }
    ],
    userFlows: [
      { id: crypto.randomUUID(), userAction: 'Click "Add Task" button', systemResponse: 'Navigate to add task form', result: 'User sees empty task form' },
      { id: crypto.randomUUID(), userAction: 'Fill form and submit', systemResponse: 'Create task via API', result: 'Task appears in list' }
    ],
    brandStyle: { inheritTheme: true },
    accessibility: { mobileSafe: true, keyboardNav: true, screenReader: true },
    successCriteria: 'Users can create, read, update, and delete tasks through the UI'
  })
}
