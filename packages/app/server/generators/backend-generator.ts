/**
 * Backend Generator - Node.js Local Backend
 * Generates Express backend code with TypeScript
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import type { JobManager } from '../job-manager'

interface BackendFormData {
  appName: string
  description: string
  language?: string
  framework?: string
  database?: string
  auth?: boolean
  port?: number
}

export class BackendGenerator {
  private jobManager: JobManager
  private jobId: string
  
  constructor(jobManager: JobManager, jobId: string) {
    this.jobManager = jobManager
    this.jobId = jobId
  }
  
  async generate(formData: BackendFormData): Promise<void> {
    const workspacePath = this.jobManager.getWorkspacePath(this.jobId)
    const backendPath = path.join(workspacePath, 'backend')
    
    await this.log('info', 'Generating backend project structure...')
    
    // Create directories
    await fs.mkdir(backendPath, { recursive: true })
    await fs.mkdir(path.join(backendPath, 'src'), { recursive: true })
    await fs.mkdir(path.join(backendPath, 'src', 'routes'), { recursive: true })
    await fs.mkdir(path.join(backendPath, 'src', 'middleware'), { recursive: true })
    
    // Generate files
    await this.generatePackageJson(backendPath, formData)
    await this.generateTsConfig(backendPath)
    await this.generateIndex(backendPath, formData)
    await this.generateRoutes(backendPath, formData)
    await this.generateMiddleware(backendPath, formData)
    await this.generateEnvFile(backendPath, formData)
    
    await this.log('success', 'Backend code generated successfully')
  }
  
  private async generatePackageJson(backendPath: string, formData: BackendFormData): Promise<void> {
    const packageJson = {
      name: formData.appName.toLowerCase().replace(/\s+/g, '-'),
      version: '1.0.0',
      description: formData.description,
      main: 'dist/index.js',
      scripts: {
        build: 'tsc',
        start: 'ts-node src/index.ts',
        dev: 'nodemon src/index.ts',
        'start:prod': 'node dist/index.js'
      },
      dependencies: {
        express: '^4.18.2',
        cors: '^2.8.5',
        'dotenv': '^16.3.1',
        ...(formData.database === 'mongodb' && { mongoose: '^8.0.0' }),
        ...(formData.database === 'postgresql' && { pg: '^8.11.0', 'pg-pool': '^3.6.0' }),
        ...(formData.database === 'sqlite' && { 'better-sqlite3': '^9.0.0' }),
        ...(formData.auth && { 'jsonwebtoken': '^9.0.2', 'bcryptjs': '^2.4.3' })
      },
      devDependencies: {
        '@types/node': '^20.0.0',
        '@types/express': '^4.17.21',
        '@types/cors': '^2.8.15',
        ...(formData.auth && { '@types/jsonwebtoken': '^9.0.5', '@types/bcryptjs': '^2.4.6' }),
        typescript: '^5.2.2',
        'ts-node': '^10.9.1',
        nodemon: '^3.0.1'
      }
    }
    
    await fs.writeFile(
      path.join(backendPath, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    )
    
    await this.log('info', 'Generated package.json')
  }
  
  private async generateTsConfig(backendPath: string): Promise<void> {
    const tsConfig = {
      compilerOptions: {
        target: 'ES2020',
        module: 'commonjs',
        lib: ['ES2020'],
        outDir: './dist',
        rootDir: './src',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        resolveJsonModule: true,
        declaration: true,
        declarationMap: true,
        sourceMap: true
      },
      include: ['src/**/*'],
      exclude: ['node_modules', 'dist']
    }
    
    await fs.writeFile(
      path.join(backendPath, 'tsconfig.json'),
      JSON.stringify(tsConfig, null, 2)
    )
    
    await this.log('info', 'Generated tsconfig.json')
  }
  
  private async generateIndex(backendPath: string, formData: BackendFormData): Promise<void> {
    const authMiddleware = formData.auth ? "import { authMiddleware } from './middleware/auth'" : ''
    const authUse = formData.auth ? 'app.use(authMiddleware)' : '// Auth disabled'
    
    const indexContent = `import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { routes } from './routes'
${authMiddleware}

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
${authUse}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: '${formData.appName}'
  })
})

// API routes
app.use('/api', routes)

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: '${formData.appName}',
    description: '${formData.description}',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      api: '/api'
    }
  })
})

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err)
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  })
})

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' })
})

app.listen(PORT, () => {
  console.log(\`\\n🚀 Server running on port \${PORT}\`)
  console.log(\`📊 Health check: http://localhost:\${PORT}/health\`)
  console.log(\`📚 API docs: http://localhost:\${PORT}/\`)
})
`
    
    await fs.writeFile(path.join(backendPath, 'src', 'index.ts'), indexContent)
    await this.log('info', 'Generated src/index.ts')
  }
  
  private async generateRoutes(backendPath: string, formData: BackendFormData): Promise<void> {
    const routesContent = `import { Router } from 'express'

export const routes = Router()

// Get all items
routes.get('/items', (req, res) => {
  res.json({
    items: [
      { id: 1, name: 'Item 1', description: 'Sample item' },
      { id: 2, name: 'Item 2', description: 'Another sample item' }
    ]
  })
})

// Get single item
routes.get('/items/:id', (req, res) => {
  const { id } = req.params
  res.json({
    id: parseInt(id),
    name: \`Item \${id}\`,
    description: \`Description for item \${id}\`
  })
})

// Create item
routes.post('/items', (req, res) => {
  const { name, description } = req.body
  const newItem = {
    id: Date.now(),
    name,
    description,
    createdAt: new Date().toISOString()
  }
  res.status(201).json(newItem)
})

// Update item
routes.put('/items/:id', (req, res) => {
  const { id } = req.params
  const { name, description } = req.body
  res.json({
    id: parseInt(id),
    name,
    description,
    updatedAt: new Date().toISOString()
  })
})

// Delete item
routes.delete('/items/:id', (req, res) => {
  const { id } = req.params
  res.json({ message: \`Item \${id} deleted\` })
})

// Search items
routes.get('/search', (req, res) => {
  const { q } = req.query
  res.json({
    query: q,
    results: [
      { id: 1, name: 'Result 1' },
      { id: 2, name: 'Result 2' }
    ]
  })
})
`
    
    await fs.writeFile(path.join(backendPath, 'src', 'routes', 'index.ts'), routesContent)
    await this.log('info', 'Generated src/routes/index.ts')
  }
  
  private async generateMiddleware(backendPath: string, formData: BackendFormData): Promise<void> {
    if (!formData.auth) {
      // Create a placeholder auth file
      const placeholderContent = `// Auth middleware placeholder
// Enable auth in the form to generate full auth implementation

export const authMiddleware = (req: any, res: any, next: any) => {
  // Auth disabled - pass through
  next()
}
`
      await fs.writeFile(path.join(backendPath, 'src', 'middleware', 'auth.ts'), placeholderContent)
      return
    }
    
    const authContent = `import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

export interface AuthRequest extends Request {
  user?: {
    id: string
    email: string
  }
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization
  
  if (!authHeader) {
    return res.status(401).json({ error: 'No token provided' })
  }
  
  const token = authHeader.replace('Bearer ', '')
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any
    req.user = decoded
    next()
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' })
  }
}

export const generateToken = (userId: string, email: string): string => {
  return jwt.sign({ id: userId, email }, JWT_SECRET, { expiresIn: '24h' })
}

export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, 10)
}

export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash)
}
`
    
    await fs.writeFile(path.join(backendPath, 'src', 'middleware', 'auth.ts'), authContent)
    await this.log('info', 'Generated src/middleware/auth.ts')
  }
  
  private async generateEnvFile(backendPath: string, formData: BackendFormData): Promise<void> {
    const envContent = `# ${formData.appName} Environment Variables
NODE_ENV=development
PORT=${formData.port || 3000}

# Database (configure as needed)
${formData.database === 'mongodb' ? 'MONGODB_URI=mongodb://localhost:27017/' + formData.appName.toLowerCase().replace(/\s+/g, '_') : '# DATABASE_URL='}
${formData.database === 'postgresql' ? 'DATABASE_URL=postgresql://user:password@localhost:5432/' + formData.appName.toLowerCase().replace(/\s+/g, '_') : ''}
${formData.database === 'sqlite' ? 'SQLITE_PATH=./database.sqlite' : ''}

# Authentication
${formData.auth ? 'JWT_SECRET=your-jwt-secret-change-in-production' : '# JWT_SECRET='}

# API Keys (add your own)
# API_KEY=your-api-key
`
    
    await fs.writeFile(path.join(backendPath, '.env'), envContent)
    await fs.writeFile(path.join(backendPath, '.env.example'), envContent.replace(/=.*$/gm, '='))
    
    await this.log('info', 'Generated .env and .env.example')
  }
  
  private async log(level: 'info' | 'warn' | 'error' | 'success', message: string): Promise<void> {
    await this.jobManager.appendLog(this.jobId, {
      timestamp: Date.now(),
      level,
      message: `[generator] ${message}`,
      phase: 'implement'
    })
  }
}
