import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  
  try {
    // Try to find the port-kill-console binary
    const binaryPath = findPortKillBinary(config.portKillBinaryPath)
    
    if (!binaryPath) {
      throw new Error('Port Kill binary not found. Please build the Rust application first.')
    }
    
    // Get statistics from Rust app
    const stats = await getHistoryStatistics(binaryPath)
    
    return {
      success: true,
      stats,
      timestamp: new Date().toISOString()
    }
    
  } catch (error) {
    console.error('Error fetching history statistics:', error)
    
    return {
      success: false,
      error: error.message,
      stats: null,
      timestamp: new Date().toISOString()
    }
  }
})

function findPortKillBinary(defaultPath: string): string | null {
  // Check if the default path exists
  if (existsSync(defaultPath)) {
    return defaultPath
  }
  
  // Try common locations
  const commonPaths = [
    join(process.cwd(), 'target', 'release', 'port-kill-console'),
    join(process.cwd(), 'target', 'release', 'port-kill-console.exe'),
    join(process.cwd(), '..', 'target', 'release', 'port-kill-console'),
    join(process.cwd(), '..', 'target', 'release', 'port-kill-console.exe'),
    './target/release/port-kill-console',
    './target/release/port-kill-console.exe',
    '../target/release/port-kill-console',
    '../target/release/port-kill-console.exe'
  ]
  
  for (const path of commonPaths) {
    if (existsSync(path)) {
      return path
    }
  }
  
  return null
}

async function getHistoryStatistics(binaryPath: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const rustApp = spawn(binaryPath, ['--show-stats', '--json'], {
      stdio: ['pipe', 'pipe', 'pipe']
    })
    
    let stdout = ''
    let stderr = ''
    
    rustApp.stdout.on('data', (data) => {
      stdout += data.toString()
    })
    
    rustApp.stderr.on('data', (data) => {
      stderr += data.toString()
    })
    
    rustApp.on('close', (code) => {
      if (code !== 0) {
        console.warn(`Rust app failed with code ${code}: ${stderr}`)
        resolve(null)
        return
      }
      
      try {
        // Parse JSON output from Rust app
        const lines = stdout.trim().split('\n')
        let stats = null
        
        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line)
              if (parsed.total_kills !== undefined) {
                stats = parsed
                break
              }
            } catch (e) {
              // Skip invalid JSON lines
            }
          }
        }
        
        resolve(stats)
      } catch (error) {
        reject(error)
      }
    })
    
    rustApp.on('error', (error) => {
      console.warn(`Failed to spawn Rust app: ${error.message}`)
      resolve(null)
    })
  })
}
