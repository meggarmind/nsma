# C4 Code Level: Supporting Infrastructure

## Overview
- **Name**: Supporting Infrastructure
- **Description**: Scripts, hooks, type definitions, test utilities, and systemd service configurations that support the NSMA (Notion Sync Manager) application across development, testing, and production environments
- **Location**: `/home/feyijimiohioma/projects/Nsma/`
- **Language**: Bash (scripts/hooks), TypeScript/TSX (React hooks, types, tests), SystemD Service Files
- **Purpose**: Provides deployment automation, development workflow integration, type safety, test infrastructure, and production service management for the NSMA application

---

## Directory Structure

```
/home/feyijimiohioma/projects/Nsma/
├── scripts/                        # Deployment and migration automation
├── hooks/                          # React hooks and development hooks
├── __tests__/                      # Test files and test setup
├── systemd/                        # SystemD service templates
└── types/                          # TypeScript type definitions
```

---

## Code Elements

### Scripts Directory
Location: `/home/feyijimiohioma/projects/Nsma/scripts/`

#### setup-prod.sh
- **Type**: Bash Script
- **Location**: `/home/feyijimiohioma/projects/Nsma/scripts/setup-prod.sh`
- **Description**: Comprehensive production setup automation script that orchestrates the deployment of NSMA into a production environment with systemd service management
- **Purpose**: Automates the complete production deployment workflow including repository cloning/updating, dependency installation, application building, and systemd service configuration
- **Function Signatures**:
  - `expand_path(path: string): string` - Expands tilde (~) in file paths to absolute paths
  - Entry point: Script execution with command-line arguments

- **Key Features**:
  - Argument parsing for customizable deployment configuration
  - Color-coded console output for better readability
  - Automatic git repository cloning or updating
  - NPM dependency installation and build process
  - Dynamic systemd service file generation
  - Service enablement and startup
  - User lingering configuration for boot persistence
  - Interactive confirmation prompts

- **Configuration Parameters**:
  - `--install-dir=PATH`: Installation directory (default: ~/apps/nsma-prod)
  - `--port=PORT`: Web server port (default: 5100)
  - `--instance=NAME`: Instance name for service differentiation (default: prod)
  - `--config-dir=PATH`: Configuration directory (default: ~/.notion-sync-manager)
  - `--repo-url=URL`: Git repository URL
  - `--branch=BRANCH`: Git branch to deploy (default: master)
  - `--skip-clone`: Skip git operations for existing installations
  - `--skip-build`: Skip npm install and build steps

- **Dependencies**:
  - Bash 4+
  - Node.js (detected via which command)
  - npm
  - git
  - systemctl (user-level systemd)
  - loginctl (for lingering configuration)

- **Service Files Generated**:
  - `nsma-daemon-{instance}.service`: Background sync daemon
  - `nsma-web-{instance}.service`: Next.js web application

- **Environment Variables Set**:
  - NODE_ENV=production
  - NOTION_SYNC_CONFIG_DIR
  - NSMA_INSTANCE
  - PORT (for web service)
  - ALLOWED_ORIGINS

---

#### migrate.sh
- **Type**: Bash Script
- **Location**: `/home/feyijimiohioma/projects/Nsma/scripts/migrate.sh`
- **Description**: Migration script that converts legacy project structure to the new NSMA folder structure with proper prompt organization
- **Purpose**: Helps users migrate existing projects from old folder layouts to the standardized NSMA structure with prompt categorization
- **Function Signatures**:
  - Entry point: `./migrate.sh /path/to/project`

- **Migration Flow**:
  1. Validates project path
  2. Creates new directory structure:
     - `prompts/pending/` - Active prompts ready for execution
     - `prompts/processed/` - Completed prompts
     - `prompts/archived/` - Archived prompts
     - `prompts/deferred/` - Deferred prompts
  3. Migrates files from legacy locations
  4. Reports migration statistics

- **Directory Transformation**:
  - Legacy: `prompts/*.md` → New: `prompts/pending/`
  - Legacy: `processed/*` → New: `prompts/processed/`
  - Legacy: `archived/*` → New: `prompts/archived/`
  - Legacy: `deferred/*` → New: `prompts/deferred/`

- **Dependencies**:
  - Bash 4+
  - Standard Unix utilities (mkdir, mv, rmdir)

---

### Hooks Directory
Location: `/home/feyijimiohioma/projects/Nsma/hooks/`

#### session-start.sh
- **Type**: Bash Hook Script
- **Location**: `/home/feyijimiohioma/projects/Nsma/hooks/session-start.sh`
- **Description**: Universal session start hook that integrates with NSMA for project-specific Notion synchronization and prompt analysis
- **Purpose**: Executes automatically when starting a development session, syncing Notion data and analyzing pending tasks
- **Placement**: Should be placed in `~/.claude/hooks/` or project-specific hooks directory
- **Installation Method**: Sourced by Claude/development environment on session start

- **Features**:
  - Auto-detects project using current working directory
  - Extracts current phase from TODO.md if present
  - Executes Notion sync via NSMA CLI
  - Analyzes pending prompts with priority and phase alignment
  - Categorizes prompts as:
    - `EXECUTE`: Automatically aligned with current phase or always-execute types
    - `DECISION`: Out-of-phase, require user decision
  - Checks deferred prompts for phase re-alignment
  - Scans inbox for unassigned items
  - Always execute types: Bug Fix, Documentation, Security Fix, Technical Debt

- **Phase Alignment Logic**:
  - Automatically execute if type is in always-execute list
  - Automatically execute if phase matches current phase or is "Backlog"
  - Require decision if phase doesn't match current phase

- **Output Sections**:
  1. Project and phase banner
  2. Notion sync execution
  3. Pending prompts analysis with decision recommendations
  4. Deferred prompts alignment check
  5. Inbox summary with assignment link
  6. Dashboard and prompts directory links

- **Dependencies**:
  - Bash 4+
  - NSMA CLI (`node cli/index.js`)
  - Standard Unix utilities (grep, sed, ls, mv)
  - Access to TODO.md (optional)
  - Notion sync configuration

- **File Format Expected**:
  - YAML frontmatter in markdown files:
    - `phase:` - Development phase
    - `type:` - Task type
    - `priority:` - Task priority
    - `# Development Task:` - Task title

---

#### useToast.tsx
- **Type**: React Hook (TSX)
- **Location**: `/home/feyijimiohioma/projects/Nsma/hooks/useToast.tsx`
- **Description**: Context-based hook providing toast notification management throughout the application
- **Purpose**: Provides centralized toast notification system with automatic dismissal and manual removal
- **Client-side**: Yes (marked with 'use client')

- **Exports**:
  - `ToastProvider(props: ToastProviderProps): JSX.Element` - React context provider component
  - `useToast(): ToastContextValue` - Hook to access toast functionality

- **Function Signatures**:
  - `showToast(message: string, type?: ToastVariant, duration?: number): number`
    - Parameters:
      - `message: string` - Toast message text
      - `type?: ToastVariant` - Toast variant ('success' | 'error' | 'warning' | 'info')
      - `duration?: number` - Auto-dismiss duration in ms (default 5000, 0 for no auto-dismiss)
    - Returns: `number` - Toast ID for manual removal
  - `removeToast(id: number): void` - Manually remove a toast by ID

- **State Management**:
  - Maintains internal toast queue with auto-incrementing IDs
  - Auto-dismisses toasts after specified duration
  - Filters removed toasts from display queue

- **Dependencies**:
  - React (createContext, useContext, useState, useCallback)
  - Toast UI component (`@/components/ui/Toast`)
  - Toast type definitions (`@/types`)

- **Type Definitions**:
  - `ToastContextValue`: { showToast, removeToast }
  - `ToastProviderProps`: { children: ReactNode }
  - `ToastVariant`: 'success' | 'error' | 'warning' | 'info'
  - `Toast`: { id: string, message: string, type: ToastVariant }

---

#### useAppData.tsx
- **Type**: React Hook (TSX)
- **Location**: `/home/feyijimiohioma/projects/Nsma/hooks/useAppData.tsx`
- **Description**: Centralized data polling and state management hook providing project, status, and inbox data to the entire application with intelligent request deduplication
- **Purpose**: Replaces multiple polling loops with a single optimized polling strategy, reducing API load and improving performance
- **Client-side**: Yes (marked with 'use client')

- **Core Concepts**:
  - **Polling Configuration**:
    - Focused (active window): 15s for general data, 5s for status
    - Blurred (inactive window): 60s for all data
  - **Request Deduplication**: Prevents duplicate API calls within 30s TTL
  - **Centralized State**: Single source of truth for all polled data

- **Exports**:
  - `AppDataProvider(props: AppDataProviderProps): JSX.Element` - Context provider
  - `useAppData(): AppDataContextValue` - Hook for all data
  - `useProjects()` - Selector hook for projects only
  - `useStatus()` - Selector hook for status only
  - `useInbox()` - Selector hook for inbox only

- **Function Signatures**:
  - `fetchWithDedup<T>(url: string): Promise<T>` - Fetches with deduplication
    - Parameters: `url: string` - API endpoint
    - Returns: `Promise<T>` - Parsed JSON response
    - Deduplication: Returns existing promise if request in-flight within TTL

  - `fetchDataType<T>(type: DataType, url: string): Promise<T | null>` - Fetches specific data type
  - `fetchAll(): Promise<void>` - Fetches all data types simultaneously
  - `refresh(type: DataType): Promise<unknown>` - Manual refresh for specific type
  - `refreshAll(): Promise<void>` - Manual refresh all data

- **AppDataContextValue Properties**:
  - `projects: Project[]` - List of configured projects
  - `status: SyncStatus | null` - Current sync daemon status
  - `inbox: InboxData` - Inbox items and statistics
  - `isLoading: boolean` - Initial loading state
  - `errors: Record<string, string | null>` - Error messages per data type
  - `inboxCount: number` - Convenience selector for inbox count
  - `daemonRunning: boolean` - Convenience selector for daemon status
  - `lastSync: SyncMetrics['lastSync'] | null` - Last sync metrics

- **Polling Intervals**:
  - `focusedInterval: 15000` - 15s for projects/inbox when focused
  - `blurredInterval: 60000` - 60s for all data when blurred
  - `statusInterval: 5000` - 5s for status (sync detection) when focused

- **API Endpoints**:
  - `/api/projects` - Fetches project list
  - `/api/status` - Fetches sync daemon status and metrics
  - `/api/inbox` - Fetches inbox data and statistics

- **Dependencies**:
  - React (createContext, useContext, useState, useEffect, useCallback, useRef)
  - `useWindowFocus` hook (local)
  - Type definitions from `@/types`

- **Type Definitions**:
  - `AppDataState`: projects, status, inbox, isLoading, errors
  - `AppDataContextValue`: Extends AppDataState with actions
  - `InFlightRequest`: { promise, timestamp }
  - `DataType`: 'projects' | 'status' | 'inbox'

---

#### useWindowFocus.ts
- **Type**: React Hook (TypeScript)
- **Location**: `/home/feyijimiohioma/projects/Nsma/hooks/useWindowFocus.ts`
- **Description**: Simple hook tracking whether the browser window or tab is currently focused
- **Purpose**: Enables adaptive behavior like adjusting polling intervals based on user focus
- **Client-side**: Yes (marked with 'use client')

- **Function Signatures**:
  - `useWindowFocus(): boolean`
    - Parameters: None
    - Returns: `boolean` - True if window is focused, false if blurred

- **Events Monitored**:
  - `window.focus` - Window gains focus
  - `window.blur` - Window loses focus
  - `document.visibilitychange` - Tab visibility changes

- **Initial State**: Determined by `document.hasFocus()` at mount time

- **Cleanup**: All event listeners properly removed on unmount

- **Dependencies**:
  - React (useState, useEffect)
  - Browser DOM APIs (window.addEventListener, document.visibilityState)

---

#### useSyncEvents.tsx
- **Type**: React Hook (TSX)
- **Location**: `/home/feyijimiohioma/projects/Nsma/hooks/useSyncEvents.tsx`
- **Description**: Hook for detecting and notifying about background sync events with centralized polling integration
- **Purpose**: Monitors sync status and shows toast notifications when syncs complete
- **Client-side**: Yes (marked with 'use client')

- **Features**:
  - Uses centralized polling from `useAppData` (no duplicate requests)
  - Tracks sync timestamp changes to detect new sync events
  - Debounces notifications to prevent spam (2000ms)
  - Shows appropriate toast type based on sync result
  - Skips initial notification on mount

- **Function Signatures**:
  - `useSyncEvents(options?: UseSyncEventsOptions): UseSyncEventsReturn`
    - Parameters:
      - `options?.enabled?: boolean` - Enable/disable notifications (default: true)
    - Returns: `UseSyncEventsReturn`

- **UseSyncEventsReturn Properties**:
  - `lastSync: SyncMetrics['lastSync'] | null` - Last sync information
  - `status: SyncStatus | null` - Current sync status
  - `isPolling: boolean` - Always false (uses centralized polling)

- **Notification Logic**:
  - **Error (>0 errors)**: Warning toast with error count
  - **Success (>0 items)**: Success toast with processed count
  - **No items**: Info toast indicating sync completed with 3s duration

- **State Tracking**:
  - `lastKnownSyncRef`: Tracks previous sync timestamp to detect changes
  - `hasInitializedRef`: Skips notification on initial mount
  - `lastNotificationTimeRef`: Debounces rapid notifications

- **Dependencies**:
  - React (useEffect, useRef)
  - `useToast` hook (local)
  - `useStatus` hook from useAppData (local)
  - Type definitions from `@/types`

- **Type Definitions**:
  - `UseSyncEventsOptions`: { enabled?: boolean }
  - `UseSyncEventsReturn`: { lastSync, status, isPolling }

---

### Tests Directory
Location: `/home/feyijimiohioma/projects/Nsma/__tests__/`

#### setup.ts
- **Type**: Test Configuration File (TypeScript)
- **Location**: `/home/feyijimiohioma/projects/Nsma/__tests__/setup.ts`
- **Description**: Vitest configuration file setting up test environment with necessary mocks and polyfills
- **Purpose**: Prepares the test environment for React component testing with Next.js and browser APIs
- **Test Runner**: Vitest

- **Setup Operations**:
  1. Imports testing library DOM matchers (`@testing-library/jest-dom`)
  2. Registers cleanup after each test (`cleanup`)
  3. Mocks Next.js navigation APIs
  4. Mocks window.matchMedia for responsive design testing
  5. Mocks ResizeObserver
  6. Mocks global fetch API

- **Mocked Modules**:
  - **next/navigation**:
    - `useRouter()` - Returns { push, replace, prefetch, back } stubs
    - `usePathname()` - Returns '/'
    - `useSearchParams()` - Returns empty URLSearchParams

  - **window.matchMedia**: Returns mock with properties:
    - matches, media, onchange
    - addListener, removeListener, addEventListener, removeEventListener, dispatchEvent

  - **ResizeObserver**: Global mock with { observe, unobserve, disconnect }

  - **fetch**: Global stub for API testing

- **Dependencies**:
  - @testing-library/jest-dom
  - @testing-library/react (cleanup)
  - vitest (vi.mock, vi.fn)

---

#### components/Button.test.tsx
- **Type**: Component Test (TSX)
- **Location**: `/home/feyijimiohioma/projects/Nsma/__tests__/components/Button.test.tsx`
- **Description**: Comprehensive test suite for Button component covering rendering, variants, sizes, interactions, and accessibility
- **Test Count**: 11 tests
- **Component Under Test**: `Button` from `@/components/ui/Button`

- **Test Cases**:
  1. **Rendering**: Verifies button renders children text correctly
  2. **Default Variant**: Confirms primary variant (bg-accent) applied by default
  3. **Secondary Variant**: Tests secondary variant (glass class)
  4. **Danger Variant**: Tests danger variant (bg-red-600)
  5. **Size Classes**: Tests sm (px-3 py-1.5) and lg (px-6 py-3) sizes
  6. **onClick Callback**: Verifies click handler is called once
  7. **Disabled State**: Tests disabled prop and aria-disabled attribute
  8. **Loading State**: Tests loading prop and aria-busy attribute
  9. **Disabled No Click**: Verifies onClick not called when disabled
  10. **Custom ClassName**: Tests custom class merging
  11. **Button Type**: Tests default and custom button types (button, submit)

- **Test Technologies**:
  - Framework: Vitest
  - Rendering: @testing-library/react (render, screen)
  - User Interaction: @testing-library/user-event (userEvent.setup, click)
  - Assertions: Vitest expect API

- **Tested Properties**:
  - Children content rendering
  - Variant prop values (primary, secondary, danger)
  - Size prop values (sm, md, lg)
  - Disabled prop
  - Loading prop
  - Type prop (button, submit)
  - Custom className prop
  - onClick handler

---

#### components/Modal.test.tsx
- **Type**: Component Test (TSX)
- **Location**: `/home/feyijimiohioma/projects/Nsma/__tests__/components/Modal.test.tsx`
- **Description**: Comprehensive test suite for Modal component covering visibility, accessibility, interactions, and keyboard handling
- **Test Count**: 9 tests
- **Component Under Test**: `Modal` from `@/components/ui/Modal`

- **Test Cases**:
  1. **Hidden When Closed**: Verifies dialog not rendered when isOpen=false
  2. **Visible When Open**: Verifies dialog renders with title and content when isOpen=true
  3. **Accessibility Attributes**: Tests aria-modal and aria-labelledby attributes
  4. **Close Button**: Verifies onClose called when close button clicked
  5. **Backdrop Click**: Verifies onClose called when backdrop clicked
  6. **ESC Key**: Verifies onClose called when Escape key pressed
  7. **Footer Rendering**: Tests footer slot rendering
  8. **Close Button Accessible Label**: Verifies accessible name on close button
  9. **Dialog Role**: Verifies proper dialog role and modal semantics

- **Accessibility Testing**:
  - Dialog role verification
  - aria-modal="true" attribute
  - aria-labelledby linking title to dialog
  - Close button accessible name matching /close modal/i
  - Backdrop with aria-hidden="true"

- **Interaction Testing**:
  - Click handler verification
  - User event simulation
  - Keyboard event handling (Escape key)

- **Test Technologies**:
  - Framework: Vitest
  - Rendering: @testing-library/react (render, screen)
  - User Interaction: @testing-library/user-event
  - Assertions: Vitest expect API

---

#### components/Input.test.tsx
- **Type**: Component Test (TSX)
- **Location**: `/home/feyijimiohioma/projects/Nsma/__tests__/components/Input.test.tsx`
- **Description**: Comprehensive test suite for Input component covering rendering, labels, validation, accessibility, and interactions
- **Test Count**: 13 tests
- **Component Under Test**: `Input` from `@/components/ui/Input`

- **Test Cases**:
  1. **Render Without Label**: Tests placeholder-only rendering
  2. **Render With Label**: Tests label and input association
  3. **Required Indicator**: Verifies * indicator shown for required inputs
  4. **aria-required**: Tests aria-required="true" on required inputs
  5. **Help Text Display**: Tests help text rendering and aria-describedby
  6. **Error Message Display**: Tests error text with alert role and aria-invalid
  7. **Error aria-describedby**: Verifies error linked via aria-describedby
  8. **onChange Callback**: Tests onChange handler on user input
  9. **Input Types**: Tests type attribute (password, text, etc.)
  10. **Custom ClassName**: Tests custom class merging
  11. **Label-Input Association**: Verifies label.for matches input.id
  12. **Help Text aria-describedby**: Tests aria-describedby for help text
  13. **Placeholder**: Tests placeholder text rendering

- **Accessibility Testing**:
  - Label association via for/id
  - aria-required for required inputs
  - aria-invalid for error states
  - aria-describedby for error and help text
  - Alert role for error messages

- **Type Attributes Tested**:
  - password
  - text (default)
  - Custom types via type prop

- **Test Technologies**:
  - Framework: Vitest
  - Rendering: @testing-library/react (render, screen, rerender)
  - User Interaction: @testing-library/user-event
  - Assertions: Vitest expect API

---

### SystemD Directory
Location: `/home/feyijimiohioma/projects/Nsma/systemd/`

#### nsma-web.service.template
- **Type**: SystemD Service Template
- **Location**: `/home/feyijimiohioma/projects/Nsma/systemd/nsma-web.service.template`
- **Description**: Template for creating NSMA web application systemd service units
- **Purpose**: Provides base configuration for deploying Next.js web application as a systemd user service

- **Service Properties**:
  - **Description**: NSMA Web App (__INSTANCE__)
  - **Type**: simple (long-running service)
  - **After**: network.target, nsma-daemon-__INSTANCE__.service
  - **Wants**: nsma-daemon-__INSTANCE__.service (soft dependency)

- **Environment Variables**:
  - `NODE_ENV=production` - Production mode
  - `PORT=__PORT__` - Web server listening port
  - `NOTION_SYNC_CONFIG_DIR=__CONFIG_DIR__` - Configuration directory
  - `NSMA_INSTANCE=__INSTANCE__` - Instance identifier
  - `ALLOWED_ORIGINS=localhost:__PORT__` - CORS origins

- **Service Execution**:
  - **WorkingDirectory**: __INSTALL_DIR__ - Application root
  - **ExecStart**: `__NODE_PATH__ __INSTALL_DIR__/node_modules/.bin/next start`
  - **Restart**: always - Automatic restart on failure
  - **RestartSec**: 10 - Wait 10s before restart
  - **StandardOutput**: journal - Log to systemd journal
  - **StandardError**: journal - Error logging to journal

- **Installation**:
  - **WantedBy**: default.target - User default target

- **Template Variables**:
  - `__INSTANCE__`: Service instance name (e.g., "prod", "staging")
  - `__PORT__`: HTTP port number
  - `__CONFIG_DIR__`: Configuration directory path
  - `__INSTALL_DIR__`: Installation directory path
  - `__NODE_PATH__`: Node.js executable path

- **Dependency**:
  - Requires `nsma-daemon-__INSTANCE__.service` to be running before starting

---

#### nsma-daemon.service.template
- **Type**: SystemD Service Template
- **Location**: `/home/feyijimiohioma/projects/Nsma/systemd/nsma-daemon.service.template`
- **Description**: Template for creating NSMA sync daemon systemd service units
- **Purpose**: Provides base configuration for deploying background sync daemon as a systemd user service

- **Service Properties**:
  - **Description**: NSMA Sync Daemon (__INSTANCE__)
  - **Type**: simple (long-running service)
  - **After**: network.target

- **Environment Variables**:
  - `NODE_ENV=production` - Production mode
  - `NOTION_SYNC_CONFIG_DIR=__CONFIG_DIR__` - Configuration directory
  - `NSMA_INSTANCE=__INSTANCE__` - Instance identifier

- **Service Execution**:
  - **WorkingDirectory**: __INSTALL_DIR__ - Application root
  - **ExecStart**: `__NODE_PATH__ cli/index.js --daemon`
  - **Restart**: always - Automatic restart on failure
  - **RestartSec**: 30 - Wait 30s before restart
  - **StandardOutput**: journal - Log to systemd journal
  - **StandardError**: journal - Error logging to journal

- **Installation**:
  - **WantedBy**: default.target - User default target

- **Template Variables**:
  - `__INSTANCE__`: Service instance name
  - `__CONFIG_DIR__`: Configuration directory path
  - `__INSTALL_DIR__`: Installation directory path
  - `__NODE_PATH__`: Node.js executable path

- **Purpose**: Runs background sync operations and manages Notion synchronization

---

#### notion-sync.service
- **Type**: SystemD Service Unit (Concrete Configuration)
- **Location**: `/home/feyijimiohioma/projects/Nsma/systemd/notion-sync.service`
- **Description**: Pre-configured systemd service for running the NSMA daemon in production
- **Purpose**: System-wide service for background Notion synchronization (contrasted with user-level services)

- **Service Properties**:
  - **Description**: Notion Sync Manager Daemon
  - **Type**: simple (long-running service)
  - **After**: network.target

- **Service Configuration**:
  - **User**: feyijimiohioma - Runs as specific user
  - **Environment Variables**:
    - `NODE_ENV=production`
    - `NOTION_SYNC_CONFIG_DIR=/home/feyijimiohioma/.notion-sync-manager`
  - **WorkingDirectory**: /home/feyijimiohioma/projects/Nsma
  - **ExecStart**: /home/feyijimiohioma/.nvm/versions/node/v24.11.1/bin/node cli/index.js --daemon
  - **Restart**: always - Automatic restart on failure
  - **RestartSec**: 30 - Wait 30s between restarts
  - **StandardOutput**: journal - Systemd journal logging
  - **StandardError**: journal - Error logging to journal

- **Installation**:
  - **WantedBy**: multi-user.target - System-wide service (not user-specific)

- **Configuration Specifics**:
  - Fixed Node.js path: NVM-managed v24.11.1
  - Fixed user: feyijimiohioma
  - Fixed paths: /home/feyijimiohioma/* (not templated)
  - System-wide target (multi-user.target vs default.target)

---

### Types Directory
Location: `/home/feyijimiohioma/projects/Nsma/types/`

#### index.ts
- **Type**: TypeScript Type Definition File
- **Location**: `/home/feyijimiohioma/projects/Nsma/types/index.ts`
- **Description**: Centralized TypeScript type definitions and interfaces for the entire NSMA application
- **Purpose**: Provides single source of truth for type safety across all components, hooks, and API interactions

- **Type Categories**:

##### Project Types
- `ProjectStats` - Project statistics interface
  - `totalPages: number` - Total pages in project
  - `processedItems: number` - Processed items count
  - `lastUpdated: string` - Last update timestamp

- `Project` - Project configuration and data
  - `id: string` - Unique project identifier
  - `name: string` - Display name
  - `slug: string` - URL-friendly identifier
  - `rootPageId: string` - Notion root page ID
  - `active: boolean` - Whether project is active
  - `lastSync?: string` - Last sync timestamp
  - `stats?: ProjectStats` - Project statistics
  - `promptConfig?: PromptConfig` - Prompt configuration

- `PromptConfig` - Project-specific prompt configuration
  - `customPrompt?: string` - Custom AI prompt
  - `expansionMode?: 'default' | 'concise' | 'detailed'` - Response style

##### Sync Types
- `DaemonStatus` - Daemon running status
  - `running: boolean` - Whether daemon is active
  - `status: string` - Status message
  - `uptime: string | null` - Uptime duration

- `SyncMetrics` - Sync operation metrics
  - `lastSync?: { timestamp: string; processed: number }` - Last sync info
  - `totalSyncs?: number` - Total sync count
  - `failedSyncs?: number` - Failed sync count

- `SyncLog` - Individual sync log entry
  - `id: string` - Log entry ID
  - `timestamp: string` - When event occurred
  - `type: 'sync' | 'error' | 'info'` - Log type
  - `message: string` - Log message
  - `projectId?: string` - Associated project ID

- `SyncStatus` - Complete sync system status
  - `daemon: DaemonStatus` - Daemon status
  - `metrics: SyncMetrics` - Metrics
  - `recentLogs?: SyncLog[]` - Recent log entries
  - `syncIntervalMinutes: number` - Sync interval
  - `nextSyncAt: string | null` - Next scheduled sync
  - `lastCheckAt: string | null` - Last check timestamp

##### Inbox Types
- `InboxItem` - Individual inbox item
  - `id: string` - Item ID
  - `title: string` - Display title
  - `type: string` - Item type
  - `url?: string` - Optional URL
  - `createdAt: string` - Creation timestamp
  - `projectId?: string` - Associated project ID
  - `processed?: boolean` - Whether processed

- `InboxStats` - Inbox statistics
  - `total: number` - Total items
  - `processed: number` - Processed count
  - `pending: number` - Pending count

- `InboxData` - Complete inbox data container
  - `items: InboxItem[]` - List of items
  - `stats: InboxStats` - Statistics
  - `count: number` - Total count

##### Settings Types
- `Settings` - Application settings
  - `notionToken?: string` - Notion API token
  - `anthropicApiKey?: string` - Anthropic API key
  - `syncIntervalMinutes: number` - Sync frequency
  - `hasNotionToken?: boolean` - Token presence flag
  - `hasAnthropicKey?: boolean` - API key presence flag
  - `selectedDatabaseId?: string` - Selected Notion database
  - `autoSync?: boolean` - Auto-sync enabled flag

##### UI Types
- `ToastType` - Toast notification types
  - Union: 'success' | 'error' | 'warning' | 'info'

- `Toast` - Toast notification object
  - `id: string` - Notification ID
  - `type: ToastType` - Notification type
  - `message: string` - Notification message
  - `duration?: number` - Auto-dismiss duration

- `ButtonVariant` - Button style variants
  - Union: 'primary' | 'secondary' | 'danger' | 'ghost'

- `ButtonSize` - Button size options
  - Union: 'sm' | 'md' | 'lg'

- `BadgeVariant` - Badge style variants
  - Union: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'accent'

- `SelectOption` - Select menu option
  - `value: string` - Option value
  - `label: string` - Display label

##### App Data Context Types
- `AppDataState` - Centralized app state
  - `projects: Project[]` - Projects list
  - `status: SyncStatus | null` - Sync status
  - `inbox: InboxData` - Inbox data
  - `isLoading: boolean` - Loading flag
  - `errors: Record<string, string | null>` - Error messages

- `AppDataContextValue` - Context value with actions
  - Extends `AppDataState`
  - `refresh: (type: 'projects' | 'status' | 'inbox') => Promise<unknown>` - Refresh action
  - `refreshAll: () => Promise<void>` - Refresh all data
  - `inboxCount: number` - Convenience count
  - `daemonRunning: boolean` - Convenience flag
  - `lastSync: SyncMetrics['lastSync'] | null` - Last sync info

##### Component Prop Types
- `WithChildren` - Common pattern for components accepting children
  - `children: ReactNode`

- `WithClassName` - Common pattern for custom styling
  - `className?: string`

- `IconProps` - Icon component props
  - `icon: LucideIcon | ComponentType<{ size?: number; className?: string }>`

##### API Types
- `ApiResponse<T>` - Generic API response wrapper
  - `data?: T` - Response data
  - `error?: string` - Error message
  - `message?: string` - Optional message

- `ApiError` - API error response
  - `error: string` - Error code/message
  - `message?: string` - Additional details
  - `status?: number` - HTTP status code

- **Dependencies**:
  - React (ReactNode, ComponentType)
  - lucide-react (LucideIcon)

---

## Dependencies

### Internal Dependencies

#### Cross-Hook Dependencies
- `useToast.tsx` requires: Toast UI component, type definitions
- `useAppData.tsx` requires: `useWindowFocus.ts` hook, type definitions, API endpoints
- `useSyncEvents.tsx` requires: `useToast.tsx`, `useAppData.tsx` (useStatus), type definitions
- All React hooks require: React core (hooks and types)

#### Test Dependencies
- Test files require: Test setup configuration, component imports
- Component tests require: Test utilities, mocked dependencies

#### Script Dependencies
- `setup-prod.sh` requires: Repository source (uses `setup-prod.sh` to deploy)
- `migrate.sh` requires: Project directory structure
- `session-start.sh` requires: NSMA CLI at `/home/feyijimiohioma/projects/Nsma/cli/index.js`

### External Dependencies

#### Production Dependencies
- **Node.js**: v24.11.1 (specified in notion-sync.service)
- **npm**: Package management
- **Next.js**: Web framework (started via `next start` command)
- **React**: UI framework (hooks, context, components)

#### Development Dependencies
- **Vitest**: Test framework for unit tests
- **@testing-library/react**: React component testing utilities
- **@testing-library/jest-dom**: DOM matchers for assertions
- **@testing-library/user-event**: User interaction simulation
- **lucide-react**: Icon library (type dependency)

#### System Dependencies
- **Bash 4+**: For script execution
- **git**: For repository operations (setup-prod.sh)
- **systemctl/systemd**: For service management
- **loginctl**: For user lingering configuration (optional)
- **Standard Unix utilities**: grep, sed, mv, mkdir, ls, realpath

#### API/Service Dependencies
- **Notion API**: Via Notion token configuration
- **Anthropic API**: Via API key configuration
- **NSMA CLI**: Sync daemon and backend (`cli/index.js`)

#### Notion Integration
- Notion database synchronization
- Notion authentication tokens
- Project root page IDs in Notion

---

## Relationships and Dependencies

### Data Flow
```
Session Start
    ↓
session-start.sh executes
    ├─ NSMA CLI sync (cli/index.js --project <name>)
    ├─ Parse pending prompts (phase alignment)
    └─ Check inbox for assignments

Development Session
    ↓
useAppData.tsx provides centralized polling
    ├─ /api/projects (15s focused, 60s blurred)
    ├─ /api/status (5s focused, 60s blurred)
    └─ /api/inbox (15s focused, 60s blurred)
        ↓
    useSyncEvents.tsx detects changes
        ↓
    useToast.tsx shows notifications
        ├─ Success (items processed)
        ├─ Warning (errors occurred)
        └─ Info (sync completed)

Production Deployment
    ↓
setup-prod.sh orchestrates
    ├─ Clone/update repository
    ├─ npm install & build
    ├─ Generate systemd services
    │   ├─ nsma-daemon-<instance>.service
    │   └─ nsma-web-<instance>.service
    └─ Enable & start services
        ↓
    systemd manages long-running processes
        ├─ Automatic restart on failure
        ├─ Logging to journal
        └─ User lingering for boot persistence
```

### Hook Composition
```
Component Tree
    ↓
<AppDataProvider> (useAppData.tsx)
    ├─ Manages centralized polling
    ├─ Deduplicates requests
    └─ Provides context value
        ↓
    <ToastProvider> (useToast.tsx)
        └─ Manages toast queue
            ↓
        Components using hooks
        ├─ useAppData() → projects, status, inbox
        ├─ useToast() → showToast, removeToast
        ├─ useWindowFocus() → focused state
        ├─ useStatus() → status-specific data
        ├─ useProjects() → projects-specific data
        └─ useInbox() → inbox-specific data
            ↓
        useSyncEvents() → detects sync changes
            ↓
        showToast() → notification
```

### Service Dependency Graph
```
Network (systemd requirement)
    ↓
nsma-daemon-<instance>.service (after network.target)
    ├─ Runs: cli/index.js --daemon
    ├─ Handles: Background sync
    └─ Provides: /api/status, /api/projects, /api/inbox
        ↓
nsma-web-<instance>.service (after daemon, wants daemon)
    ├─ Runs: next start
    ├─ Depends on: daemon for API endpoints
    └─ Exposes: Web UI on configured port
```

### Type Definition Usage
```
types/index.ts exports
    ├─ Project types → useAppData.tsx, API responses
    ├─ SyncStatus types → useAppData.tsx, useStatus hook
    ├─ InboxData types → useAppData.tsx, useInbox hook
    ├─ Toast types → useToast.tsx, UI components
    ├─ UI component types → Button, Modal, Input tests
    └─ Settings types → Settings management
```

---

## Code Patterns and Conventions

### Bash Scripts
- **Error handling**: `set -e` for immediate exit on error
- **Color output**: Defined color constants for readable output
- **Path handling**: Functions for tilde expansion and absolute path resolution
- **Logging**: Formatted with step indicators [n/6], checkmarks, and colors
- **Configuration**: Command-line arguments with defaults

### React Hooks
- **Client-side marking**: 'use client' directive for all React hooks
- **Error handling**: Throw errors when hooks used outside required context
- **Custom hooks**: Return objects with descriptive property names
- **Type safety**: Full TypeScript with exported type definitions
- **Cleanup**: useEffect cleanup functions for event listeners

### Tests
- **Framework**: Vitest with @testing-library/react
- **Mocking**: Next.js, window, ResizeObserver, fetch
- **Accessibility**: Testing aria attributes and semantic HTML
- **User interactions**: Using userEvent for realistic user actions
- **Component testing**: Testing behavior, not implementation

### SystemD Services
- **Template pattern**: Variables (e.g., __INSTANCE__) for customization
- **Logging**: All services use journal for logging
- **Restart policy**: Always restart with configurable delay
- **Service ordering**: After network.target, explicit dependencies
- **Target selection**: default.target for user services, multi-user.target for system

### Type Definitions
- **Organization**: Grouped by domain (Projects, Sync, Inbox, UI, Settings)
- **Unions**: Used for variant and option types
- **Interfaces**: Used for objects with multiple properties
- **Generics**: ApiResponse<T> for reusable response types
- **Re-exports**: Types exported from single index.ts file

---

## Notable Implementation Details

### Request Deduplication in useAppData
The `fetchWithDedup` function prevents duplicate API calls within a 30-second TTL window. When multiple components mount simultaneously and call the same endpoint, the promise from the first request is reused for subsequent requests. This significantly reduces API load during page loads and component mounting.

### Polling Strategy Adaptation
The application uses different polling intervals based on window focus:
- **Focused (active)**: 15s for general data, 5s for status (fast sync detection)
- **Blurred (inactive)**: 60s for all data (resource conservation)

This adaptive approach balances responsiveness with resource consumption.

### Prompt Phase Alignment Logic
The session-start.sh hook implements sophisticated prompt categorization:
- Always-execute types bypass phase checking: Bug Fix, Documentation, Security Fix, Technical Debt
- Phase-aligned prompts marked as ready to execute
- Out-of-phase prompts require user decision: defer, execute anyway, or archive
- Deferred prompts checked against current phase for re-alignment

### Service Instance Multiplexing
The setup-prod.sh and service templates support multiple NSMA instances:
- Each instance has unique name (e.g., "prod", "staging")
- Services named with instance suffix: nsma-daemon-{instance}.service
- Different ports and config directories per instance
- Enables running multiple NSMA deployments on same system

### TypeScript Type Organization
Types are organized by domain:
- Business logic types: Project, SyncStatus, InboxItem
- UI types: Toast, Button variants, Badge variants
- Common patterns: WithChildren, WithClassName, IconProps
- API types: ApiResponse<T>, ApiError

This organization makes types discoverable and maintainable.

---

## Testing Strategy

### Unit Tests
- Component tests verify rendering, props, and interactions
- Test setup mocks Next.js and browser APIs
- Accessibility testing ensures aria attributes and semantic HTML
- User interaction testing uses realistic user event sequences

### Test Coverage
- **Button**: Rendering, variants, sizes, disabled state, loading state, click handling
- **Modal**: Visibility, accessibility, close triggers (button, backdrop, ESC key), footer
- **Input**: Label association, required indicator, help text, error display, type variants

### Mock Strategy
- Next.js navigation mocked as stubs
- Browser APIs (matchMedia, ResizeObserver, fetch) mocked at global level
- Event cleanup ensures tests don't interfere with each other

---

## Deployment Process

### Production Setup
1. **Pre-flight checks**: Validates Node.js, git, paths
2. **Repository**: Clones or updates from git
3. **Dependencies**: Runs npm install with production=false
4. **Build**: Executes npm run build
5. **Services**: Generates systemd service files
6. **Enablement**: Registers services with systemd
7. **Startup**: Starts daemon first, then web service
8. **Persistence**: Enables user lingering for boot-time startup

### Service Management
- Services run as user-level systemd units
- Automatic restart on failure (RestartSec: 10-30s)
- Logging to systemd journal for debugging
- Service dependencies ensure correct startup order

### Migration Process
- Creates standardized prompt structure
- Moves existing prompts to correct directories
- Cleans up empty legacy directories
- Reports migration statistics

---

## Security Considerations

### Scripts
- **Error handling**: Exit immediately on error (`set -e`)
- **Path handling**: Properly expands tilde and converts to absolute paths
- **No hardcoded secrets**: Configuration via environment variables
- **User confirmation**: Interactive prompt before destructive operations

### Service Configuration
- Services run as specific user (not root)
- Environment variables for sensitive configuration
- Standard input/output to journal (no exposed logs)
- Restart limits via RestartSec to prevent rapid restart loops

### Type System
- TypeScript provides compile-time type safety
- API response types prevent type confusion
- Optional fields for backward compatibility

---

## File Summary

| File | Type | Purpose | Lines |
|------|------|---------|-------|
| setup-prod.sh | Bash | Production deployment automation | 284 |
| migrate.sh | Bash | Project structure migration | 101 |
| session-start.sh | Bash | Development session hook | 170 |
| useToast.tsx | React Hook | Toast notification system | 58 |
| useAppData.tsx | React Hook | Centralized data polling | 295 |
| useWindowFocus.ts | React Hook | Window focus tracking | 44 |
| useSyncEvents.tsx | React Hook | Sync event notifications | 115 |
| setup.ts | Test Config | Test environment setup | 46 |
| Button.test.tsx | Test File | Button component tests | 89 |
| Modal.test.tsx | Test File | Modal component tests | 114 |
| Input.test.tsx | Test File | Input component tests | 75 |
| nsma-web.service.template | SystemD | Web service template | 22 |
| nsma-daemon.service.template | SystemD | Daemon service template | 19 |
| notion-sync.service | SystemD | Production daemon service | 19 |
| index.ts | Types | Type definitions | 184 |

---

## Cross-Directory Dependencies Map

```
types/index.ts
    ├─ imported by: All hooks, tests, components
    └─ exports: 25+ type definitions and interfaces

hooks/ (React Hooks)
    ├─ useToast.tsx
    │   ├─ uses: Toast UI component, types/index.ts
    │   └─ provides: Toast notification system
    ├─ useAppData.tsx
    │   ├─ uses: useWindowFocus.ts, types/index.ts, API endpoints
    │   └─ provides: Centralized data polling, deduplication
    ├─ useSyncEvents.tsx
    │   ├─ uses: useToast.tsx, useAppData.tsx, types/index.ts
    │   └─ provides: Sync event notifications
    └─ useWindowFocus.ts
        ├─ uses: React hooks
        └─ provides: Window focus tracking

__tests__/ (Component Tests)
    ├─ setup.ts
    │   ├─ configures: Vitest environment
    │   ├─ mocks: Next.js, window, ResizeObserver, fetch
    │   └─ provides: Test infrastructure
    ├─ components/Button.test.tsx
    │   ├─ imports: Button component, vitest, @testing-library/*
    │   └─ tests: Button rendering, variants, interactions
    ├─ components/Modal.test.tsx
    │   └─ tests: Modal visibility, accessibility, interactions
    └─ components/Input.test.tsx
        └─ tests: Input rendering, labels, validation, accessibility

scripts/ (Deployment Scripts)
    ├─ setup-prod.sh
    │   ├─ depends on: git, Node.js, npm, systemctl
    │   ├─ generates: nsma-daemon-*.service, nsma-web-*.service
    │   └─ installs to: ~/apps/nsma-prod (default)
    ├─ migrate.sh
    │   └─ transforms: Project folder structure
    └─ hooks/session-start.sh
        ├─ depends on: cli/index.js (NSMA CLI)
        └─ integrates with: TODO.md, prompts/* directories

systemd/ (Service Configuration)
    ├─ nsma-web.service.template
    │   ├─ variables: __INSTANCE__, __PORT__, __CONFIG_DIR__, __INSTALL_DIR__, __NODE_PATH__
    │   ├─ runs: Next.js application (next start)
    │   ├─ depends on: nsma-daemon-<instance>.service
    │   └─ target: default.target (user services)
    ├─ nsma-daemon.service.template
    │   ├─ variables: __INSTANCE__, __CONFIG_DIR__, __INSTALL_DIR__, __NODE_PATH__
    │   ├─ runs: cli/index.js --daemon
    │   ├─ provides: API endpoints (/api/projects, /api/status, /api/inbox)
    │   └─ target: default.target (user services)
    └─ notion-sync.service
        ├─ hardcoded: User, paths, Node.js version
        ├─ runs: Background sync daemon
        └─ target: multi-user.target (system service)
```

---

## Notes

### Architecture Insights
- **Polling Strategy**: The adaptive polling system (15s focused, 60s blurred) ensures the application remains responsive while conserving resources
- **Request Deduplication**: Prevents cascading API calls from multiple components mounting simultaneously
- **Service Composition**: Multiple NSMA instances can run independently with different ports and configurations
- **Type Safety**: Centralized types in `types/index.ts` ensure consistency across all hooks and components

### Development Workflow
- Session start hook integrates Notion sync with phase alignment checking
- Prompt categorization helps developers focus on aligned tasks
- Phase mismatch detection enables informed decision-making about task execution

### Production Deployment
- Fully automated setup script reduces manual configuration
- SystemD integration provides standard service management
- Template-based services support multiple deployments on single system
- Journal-based logging integrates with system monitoring

### Testing Infrastructure
- Comprehensive mocking ensures tests don't depend on external systems
- Accessibility testing ensures components are usable by all users
- User event simulation provides realistic test scenarios

### Future Extensibility
- Template-based systemd services support easy customization
- Type definitions provide foundation for API expansion
- Hook composition pattern allows easy feature addition
- Test setup provides foundation for adding new components
