/**
 * Frontend Generator - Node.js Local Backend
 * Generates React frontend code with Vite and Tailwind CSS
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import type { JobManager } from '../job-manager'

interface UIFormData {
  appName: string
  description: string
  framework?: string
  styling?: string
  features?: string[]
  backendUrl?: string
}

export class FrontendGenerator {
  private jobManager: JobManager
  private jobId: string
  
  constructor(jobManager: JobManager, jobId: string) {
    this.jobManager = jobManager
    this.jobId = jobId
  }
  
  async generate(formData: UIFormData): Promise<void> {
    const workspacePath = this.jobManager.getWorkspacePath(this.jobId)
    const frontendPath = path.join(workspacePath, 'frontend')
    
    await this.log('info', 'Generating frontend project structure...')
    
    // Create directories
    await fs.mkdir(frontendPath, { recursive: true })
    await fs.mkdir(path.join(frontendPath, 'src'), { recursive: true })
    await fs.mkdir(path.join(frontendPath, 'src', 'components'), { recursive: true })
    await fs.mkdir(path.join(frontendPath, 'src', 'hooks'), { recursive: true })
    await fs.mkdir(path.join(frontendPath, 'src', 'types'), { recursive: true })
    await fs.mkdir(path.join(frontendPath, 'public'), { recursive: true })
    
    // Generate files
    await this.generatePackageJson(frontendPath, formData)
    await this.generateViteConfig(frontendPath)
    await this.generateTsConfig(frontendPath)
    await this.generateTailwindConfig(frontendPath)
    await this.generateIndexHtml(frontendPath, formData)
    await this.generateMain(frontendPath, formData)
    await this.generateApp(frontendPath, formData)
    await this.generateComponents(frontendPath, formData)
    await this.generateHooks(frontendPath, formData)
    await this.generateTypes(frontendPath, formData)
    await this.generateStyles(frontendPath, formData)
    
    await this.log('success', 'Frontend code generated successfully')
  }
  
  private async generatePackageJson(frontendPath: string, formData: UIFormData): Promise<void> {
    const packageJson = {
      name: formData.appName.toLowerCase().replace(/\s+/g, '-'),
      private: true,
      version: '1.0.0',
      type: 'module',
      scripts: {
        dev: 'vite',
        build: 'tsc && vite build',
        preview: 'vite preview',
        lint: 'eslint . --ext ts,tsx'
      },
      dependencies: {
        react: '^18.2.0',
        'react-dom': '^18.2.0',
        'react-router-dom': '^6.20.0'
      },
      devDependencies: {
        '@types/react': '^18.2.37',
        '@types/react-dom': '^18.2.15',
        '@vitejs/plugin-react': '^4.2.0',
        autoprefixer: '^10.4.16',
        postcss: '^8.4.31',
        tailwindcss: '^3.3.5',
        typescript: '^5.2.2',
        vite: '^5.0.0'
      }
    }
    
    await fs.writeFile(
      path.join(frontendPath, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    )
    
    await this.log('info', 'Generated package.json')
  }
  
  private async generateViteConfig(frontendPath: string): Promise<void> {
    const viteConfig = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 4000
  }
})
`
    
    await fs.writeFile(path.join(frontendPath, 'vite.config.ts'), viteConfig)
    await this.log('info', 'Generated vite.config.ts')
  }
  
  private async generateTsConfig(frontendPath: string): Promise<void> {
    const tsConfig = {
      compilerOptions: {
        target: 'ES2020',
        useDefineForClassFields: true,
        lib: ['ES2020', 'DOM', 'DOM.Iterable'],
        module: 'ESNext',
        skipLibCheck: true,
        moduleResolution: 'bundler',
        allowImportingTsExtensions: true,
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        jsx: 'react-jsx',
        strict: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        noFallthroughCasesInSwitch: true
      },
      include: ['src'],
      references: [{ path: './tsconfig.node.json' }]
    }
    
    await fs.writeFile(
      path.join(frontendPath, 'tsconfig.json'),
      JSON.stringify(tsConfig, null, 2)
    )
    
    const tsConfigNode = {
      compilerOptions: {
        composite: true,
        skipLibCheck: true,
        module: 'ESNext',
        moduleResolution: 'bundler',
        allowSyntheticDefaultImports: true
      },
      include: ['vite.config.ts']
    }
    
    await fs.writeFile(
      path.join(frontendPath, 'tsconfig.node.json'),
      JSON.stringify(tsConfigNode, null, 2)
    )
    
    await this.log('info', 'Generated tsconfig.json')
  }
  
  private async generateTailwindConfig(frontendPath: string): Promise<void> {
    const tailwindConfig = `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        }
      }
    },
  },
  plugins: [],
}
`
    
    await fs.writeFile(path.join(frontendPath, 'tailwind.config.js'), tailwindConfig)
    
    const postcssConfig = `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
`
    
    await fs.writeFile(path.join(frontendPath, 'postcss.config.js'), postcssConfig)
    await this.log('info', 'Generated tailwind.config.js')
  }
  
  private async generateIndexHtml(frontendPath: string, formData: UIFormData): Promise<void> {
    const indexHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${formData.appName}</title>
    <meta name="description" content="${formData.description}" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`
    
    await fs.writeFile(path.join(frontendPath, 'index.html'), indexHtml)
    await this.log('info', 'Generated index.html')
  }
  
  private async generateMain(frontendPath: string, formData: UIFormData): Promise<void> {
    const mainContent = `import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
`
    
    await fs.writeFile(path.join(frontendPath, 'src', 'main.tsx'), mainContent)
    await this.log('info', 'Generated src/main.tsx')
  }
  
  private async generateApp(frontendPath: string, formData: UIFormData): Promise<void> {
    const backendUrl = formData.backendUrl || 'http://localhost:3000'
    
    const appContent = `import { Routes, Route, Link } from 'react-router-dom'
import { Header } from './components/Header'
import { Footer } from './components/Footer'
import { Home } from './components/Home'
import { About } from './components/About'
import { Items } from './components/Items'
import { ItemDetail } from './components/ItemDetail'

function App() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-8">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/items" element={<Items />} />
          <Route path="/items/:id" element={<ItemDetail />} />
        </Routes>
      </main>
      
      <Footer />
    </div>
  )
}

export default App
`
    
    await fs.writeFile(path.join(frontendPath, 'src', 'App.tsx'), appContent)
    await this.log('info', 'Generated src/App.tsx')
  }
  
  private async generateComponents(frontendPath: string, formData: UIFormData): Promise<void> {
    const componentsPath = path.join(frontendPath, 'src', 'components')
    
    // Header component
    const headerContent = `import { Link } from 'react-router-dom'

export function Header() {
  return (
    <header className="bg-white shadow-sm">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="text-2xl font-bold text-primary-600">
            ${formData.appName}
          </Link>
          
          <nav className="flex gap-6">
            <Link to="/" className="text-gray-600 hover:text-primary-600 transition-colors">
              Home
            </Link>
            <Link to="/items" className="text-gray-600 hover:text-primary-600 transition-colors">
              Items
            </Link>
            <Link to="/about" className="text-gray-600 hover:text-primary-600 transition-colors">
              About
            </Link>
          </nav>
        </div>
      </div>
    </header>
  )
}
`
    
    await fs.writeFile(path.join(componentsPath, 'Header.tsx'), headerContent)
    
    // Footer component
    const footerContent = `export function Footer() {
  return (
    <footer className="bg-gray-800 text-white py-6">
      <div className="container mx-auto px-4 text-center">
        <p className="text-gray-400">
          © {new Date().getFullYear()} ${formData.appName}. Built with OpenHei.
        </p>
      </div>
    </footer>
  )
}
`
    
    await fs.writeFile(path.join(componentsPath, 'Footer.tsx'), footerContent)
    
    // Home component
    const homeContent = `import { Link } from 'react-router-dom'

export function Home() {
  return (
    <div className="text-center py-16">
      <h1 className="text-5xl font-bold text-gray-900 mb-6">
        Welcome to ${formData.appName}
      </h1>
      <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
        ${formData.description}
      </p>
      <div className="flex gap-4 justify-center">
        <Link
          to="/items"
          className="bg-primary-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-primary-700 transition-colors"
        >
          View Items
        </Link>
        <Link
          to="/about"
          className="bg-gray-200 text-gray-800 px-6 py-3 rounded-lg font-medium hover:bg-gray-300 transition-colors"
        >
          Learn More
        </Link>
      </div>
    </div>
  )
}
`
    
    await fs.writeFile(path.join(componentsPath, 'Home.tsx'), homeContent)
    
    // About component
    const aboutContent = `export function About() {
  return (
    <div className="max-w-2xl mx-auto py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">About</h1>
      <p className="text-gray-600 mb-4">
        ${formData.description}
      </p>
      <p className="text-gray-600 mb-4">
        This application was generated by OpenHei App Builder.
      </p>
      <div className="bg-gray-100 rounded-lg p-6 mt-8">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Features</h2>
        <ul className="list-disc list-inside text-gray-600 space-y-2">
          <li>React with TypeScript</li>
          <li>Vite build tool</li>
          <li>Tailwind CSS styling</li>
          <li>React Router navigation</li>
        </ul>
      </div>
    </div>
  )
}
`
    
    await fs.writeFile(path.join(componentsPath, 'About.tsx'), aboutContent)
    
    // Items component
    const itemsContent = `import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useFetch } from '../hooks/useFetch'
import type { Item } from '../types'

export function Items() {
  const { data, loading, error } = useFetch<{ items: Item[] }>('/api/items')

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-red-600">Error loading items: {error.message}</p>
      </div>
    )
  }

  return (
    <div className="py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Items</h1>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {data?.items.map((item) => (
          <Link
            key={item.id}
            to={\`/items/\${item.id}\`}
            className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
          >
            <h2 className="text-xl font-semibold text-gray-800 mb-2">{item.name}</h2>
            <p className="text-gray-600">{item.description}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
`
    
    await fs.writeFile(path.join(componentsPath, 'Items.tsx'), itemsContent)
    
    // ItemDetail component
    const itemDetailContent = `import { useParams } from 'react-router-dom'
import { useFetch } from '../hooks/useFetch'
import type { Item } from '../types'

export function ItemDetail() {
  const { id } = useParams<{ id: string }>()
  const { data, loading, error } = useFetch<Item>(\`/api/items/\${id}\`)

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-red-600">Error loading item: {error.message}</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-600">Item not found</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-4">{data.name}</h1>
      <p className="text-gray-600 text-lg">{data.description}</p>
      
      <div className="mt-8 p-4 bg-gray-100 rounded-lg">
        <p className="text-sm text-gray-500">Item ID: {data.id}</p>
      </div>
    </div>
  )
}
`
    
    await fs.writeFile(path.join(componentsPath, 'ItemDetail.tsx'), itemDetailContent)
    
    await this.log('info', 'Generated components')
  }
  
  private async generateHooks(frontendPath: string, formData: UIFormData): Promise<void> {
    const hooksPath = path.join(frontendPath, 'src', 'hooks')
    const backendUrl = formData.backendUrl || 'http://localhost:3000'
    
    const useFetchContent = `import { useState, useEffect } from 'react'

interface UseFetchResult<T> {
  data: T | null
  loading: boolean
  error: Error | null
}

export function useFetch<T>(url: string): UseFetchResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const response = await fetch(\`${backendUrl}\${url}\`)
        
        if (!response.ok) {
          throw new Error(\`HTTP error! status: \${response.status}\`)
        }
        
        const json = await response.json()
        setData(json)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'))
        setData(null)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [url])

  return { data, loading, error }
}
`
    
    await fs.writeFile(path.join(hooksPath, 'useFetch.ts'), useFetchContent)
    await this.log('info', 'Generated hooks')
  }
  
  private async generateTypes(frontendPath: string, formData: UIFormData): Promise<void> {
    const typesPath = path.join(frontendPath, 'src', 'types')
    
    const typesContent = `export interface Item {
  id: number
  name: string
  description: string
}

export interface ApiResponse<T> {
  data: T
  message?: string
}
`
    
    await fs.writeFile(path.join(typesPath, 'index.ts'), typesContent)
    await this.log('info', 'Generated types')
  }
  
  private async generateStyles(frontendPath: string, formData: UIFormData): Promise<void> {
    const stylesContent = `@tailwind base;
@tailwind components;
@tailwind utilities;

/* Custom styles */
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
}
`
    
    await fs.writeFile(path.join(frontendPath, 'src', 'index.css'), stylesContent)
    await this.log('info', 'Generated styles')
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
