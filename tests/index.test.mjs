import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'path'

// Hoist mock functions to ensure they're available before module imports
const { mockReadFile, mockWriteFile, mockAccess, mockMkdir, mockReaddir, mockUnlink } = vi.hoisted(() => ({
  mockReadFile: vi.fn(),
  mockWriteFile: vi.fn(),
  mockAccess: vi.fn(),
  mockMkdir: vi.fn(),
  mockReaddir: vi.fn(),
  mockUnlink: vi.fn(),
}))

// Mock the required modules
vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn(),
  },
}))

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}))

vi.mock('fs/promises', () => {
  // Create a mock object that matches fs/promises structure
  // fs/promises is a namespace object, so we return it as both default and named exports
  const mockFs = {
    readFile: mockReadFile,
    writeFile: mockWriteFile,
    access: mockAccess,
    mkdir: mockMkdir,
    readdir: mockReaddir,
    unlink: mockUnlink,
  }
  // Return as default export (since source uses `import fs from 'fs/promises'`)
  // In Node.js, when you import fs/promises as default, you get the namespace object
  return {
    default: mockFs,
    ...mockFs,
  }
})

describe('Browser Review Tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset mock implementations
    mockReadFile.mockReset()
    mockWriteFile.mockReset()
    mockAccess.mockReset()
    mockMkdir.mockReset()
    mockReaddir.mockReset()
    mockUnlink.mockReset()
  })

  describe('parseArgs', () => {
    it('should parse title argument', async () => {
      const originalArgv = process.argv
      process.argv = ['node', 'index.mjs', '--title', 'Test Review']

      const { parseArgs } = await import('../src/index.mjs')

      const config = await parseArgs()
      expect(config.title).toBe('Test Review')

      process.argv = originalArgv
    })

    it('should parse url argument', async () => {
      const originalArgv = process.argv
      process.argv = ['node', 'index.mjs', '--url', 'http://example.com']

      const { parseArgs } = await import('../src/index.mjs')

      const config = await parseArgs()
      expect(config.url).toBe('http://example.com')

      process.argv = originalArgv
    })

    it('should parse config file argument', async () => {
      const configData = { title: 'Config Title', baseUrl: 'http://config.com' }
      mockReadFile.mockResolvedValue(JSON.stringify(configData))

      const originalArgv = process.argv
      process.argv = ['node', 'index.mjs', '--config', 'test-config.json']

      const { parseArgs } = await import('../src/index.mjs')

      const config = await parseArgs()
      expect(config.title).toBe('Config Title')
      expect(config.baseUrl).toBe('http://config.com')
      expect(mockReadFile).toHaveBeenCalledWith('test-config.json', 'utf-8')

      process.argv = originalArgv
    })

    it('should handle invalid JSON in config file', async () => {
      mockReadFile.mockResolvedValue('invalid json')

      const originalArgv = process.argv
      process.argv = ['node', 'index.mjs', '--config', 'invalid.json']

      const { parseArgs } = await import('../src/index.mjs')

      await expect(parseArgs()).rejects.toThrow()

      process.argv = originalArgv
    })
  })

  describe('ensureDir', () => {
    it('should create directory if it does not exist', async () => {
      const error = new Error('Directory does not exist')
      error.code = 'ENOENT'
      mockAccess.mockRejectedValue(error)
      mockMkdir.mockResolvedValue()

      const { ensureDir } = await import('../src/index.mjs')

      await ensureDir('/test/path')

      expect(mockAccess).toHaveBeenCalledWith('/test/path')
      expect(mockMkdir).toHaveBeenCalledWith('/test/path', { recursive: true })
    })

    it('should not create directory if it exists', async () => {
      mockAccess.mockResolvedValue()

      const { ensureDir } = await import('../src/index.mjs')

      await ensureDir('/test/path')

      expect(mockAccess).toHaveBeenCalledWith('/test/path')
      expect(mockMkdir).not.toHaveBeenCalled()
    })
  })

  describe('generateHTMLReport', () => {
    it('should generate HTML report with correct structure', async () => {
      const error = new Error('Directory does not exist')
      error.code = 'ENOENT'
      mockAccess.mockRejectedValue(error)
      mockMkdir.mockResolvedValue()
      mockWriteFile.mockResolvedValue()

      const { generateHTMLReport } = await import('../src/index.mjs')

      const config = {
        title: 'Test Review',
        baseUrl: 'http://localhost:3000',
        url: 'http://localhost:3000/page',
        outputDir: path.join(process.cwd(), 'review-reports'),
      }

      const artifacts = [
        {
          type: 'screenshot',
          name: 'Test Screenshot',
          path: '/path/to/screenshot.png',
          timestamp: Date.now(),
        },
      ]

      const reportPath = await generateHTMLReport(config, artifacts)

      expect(mockWriteFile).toHaveBeenCalledTimes(1)
      const [filePath, htmlContent] = mockWriteFile.mock.calls[0]
      expect(filePath).toContain('review-reports/index.html')
      expect(htmlContent).toContain('Test Review')
      expect(htmlContent).toContain('Test Screenshot')
      expect(htmlContent).toContain('<html')
      expect(htmlContent).toContain('</html>')
      expect(reportPath).toContain('review-reports/index.html')
    })

    it('should handle video artifacts', async () => {
      const error = new Error('Directory does not exist')
      error.code = 'ENOENT'
      mockAccess.mockRejectedValue(error)
      mockMkdir.mockResolvedValue()
      mockWriteFile.mockResolvedValue()

      const { generateHTMLReport } = await import('../src/index.mjs')

      const config = {
        title: 'Video Test',
        outputDir: path.join(process.cwd(), 'review-reports'),
      }
      const artifacts = [
        {
          type: 'video',
          name: 'Test Video',
          path: '/path/to/video.webm',
          timestamp: Date.now(),
          duration: 5,
        },
        {
          type: 'gif',
          name: 'Test GIF',
          path: '/path/to/recording.gif',
          timestamp: Date.now(),
        },
      ]

      await generateHTMLReport(config, artifacts)

      expect(mockWriteFile).toHaveBeenCalledTimes(1)
      const htmlContent = mockWriteFile.mock.calls[0][1]
      expect(htmlContent).toContain('Test Video')
      expect(htmlContent).toContain('Test GIF')
      expect(htmlContent).toContain('video.webm')
      expect(htmlContent).toContain('recording.gif')
      expect(htmlContent).toContain('Duration: 5s')
    })

    it('should handle empty artifacts array', async () => {
      const error = new Error('Directory does not exist')
      error.code = 'ENOENT'
      mockAccess.mockRejectedValue(error)
      mockMkdir.mockResolvedValue()
      mockWriteFile.mockResolvedValue()

      const { generateHTMLReport } = await import('../src/index.mjs')

      const config = {
        title: 'Empty Test',
        outputDir: path.join(process.cwd(), 'review-reports'),
      }
      const artifacts = []

      await generateHTMLReport(config, artifacts)

      expect(mockWriteFile).toHaveBeenCalledTimes(1)
      const htmlContent = mockWriteFile.mock.calls[0][1]
      expect(htmlContent).toContain('Empty Test')
      expect(htmlContent).toContain('Total Artifacts</div>')
    })
  })

  describe('checkFFmpeg', () => {
    it('should return true when ffmpeg is available', async () => {
      const cpMock = await import('child_process')
      cpMock.execSync.mockReturnValue()

      const { checkFFmpeg } = await import('../src/index.mjs')

      const result = checkFFmpeg()
      expect(result).toBe(true)
      expect(cpMock.execSync).toHaveBeenCalledWith('which ffmpeg', { stdio: 'ignore' })
    })

    it('should return false when ffmpeg is not available', async () => {
      const cpMock = await import('child_process')
      cpMock.execSync.mockImplementation(() => {
        throw new Error('Command failed')
      })

      const { checkFFmpeg } = await import('../src/index.mjs')

      const result = checkFFmpeg()
      expect(result).toBe(false)
    })
  })
})