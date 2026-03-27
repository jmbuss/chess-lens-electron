# API Creation Guide

This guide explains how to create APIs in the Chess Lens application, using the `user` API as a reference example.

## Overview

APIs in this Electron application follow a consistent pattern:
- They use IPC (Inter-Process Communication) to communicate between the renderer (frontend) and main (backend) processes
- They implement handlers that extend the `IpcHandler` base class
- They use TypeScript for type-safe request/response definitions
- They follow a modular structure with handlers organized by domain (e.g., `user`, `platform`)

## File Structure

The User API follows this structure:

```
src/api/
  user/
    handlers/
      create.ts              # Create user handler
      getSingleAppUser.ts    # Get user handler
      update.ts              # Update user handler
      index.ts               # Export all handlers
    register.ts              # Register all user handlers
  register.ts                # Register all API handlers (main entry point)
```

## Step-by-Step Guide

### 1. Create Handler Files

Each API endpoint is a separate handler file. Create individual handler files in `src/api/{domain}/handlers/`.

**Example: Create Handler** (`src/api/user/handlers/create.ts`)

```typescript
import Database from 'better-sqlite3'
import { IpcMainEvent } from 'electron'
import { UserData, UserModel } from 'src/database/user'
import { IpcHandler } from 'src/ipc/IPCHandler'
import { IpcRequest, IpcResponse } from 'src/ipc/types'

// Type-safe channel definition using module augmentation
declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'user:create': {
      request: { firstName: string; lastName: string; email: string }
      response: UserData
    }
  }
}

export class UserCreateHandler extends IpcHandler {
  static readonly channel = 'user:create' as const

  constructor(private db: Database.Database) {
    super()
  }

  async handle(
    _event: IpcMainEvent,
    request: IpcRequest<{ firstName: string; lastName: string; email: string }>
  ): Promise<IpcResponse<UserData>> {
    if (!request.params) {
      return {
        success: false,
        error: 'No parameters provided',
      }
    }

    const user = UserModel.create(this.db, request.params)
    return {
      success: true,
      data: user,
    }
  }
}
```

**Key points:**
- Extend `IpcHandler` base class
- Define a static `channel` property with the channel name (use `namespace:action` pattern, e.g., `user:create`)
- Use module augmentation to add type definitions to `IpcChannels` interface
- The `handle` method must return `Promise<IpcResponse<T>>`
- Always validate `request.params` if they're required
- Return `{ success: true, data: ... }` for success, `{ success: false, error: ... }` for errors

### 2. Create Index File for Handlers

Create `src/api/{domain}/handlers/index.ts` to export all handlers:

```typescript
// src/api/user/handlers/index.ts
export { UserCreateHandler } from './create'
export { UserGetSingleAppUserHandler } from './getSingleAppUser'
export { UserUpdateHandler } from './update'
```

### 3. Create Registration File

Create `src/api/{domain}/register.ts` to register all handlers for that domain:

```typescript
// src/api/user/register.ts
import { IPCHandlerRegistry } from 'src/ipc/IPCHandlerRegistry'
import Database from 'better-sqlite3'
import { UserCreateHandler, UserGetSingleAppUserHandler, UserUpdateHandler } from './handlers'

export const registerUserHandlers = (
  ipcHandlerRegistry: IPCHandlerRegistry,
  db: Database.Database
) => {
  const userHandlers = [
    new UserGetSingleAppUserHandler(db),
    new UserCreateHandler(db),
    new UserUpdateHandler(db),
  ]
  ipcHandlerRegistry.registerHandlers(...userHandlers)
}
```

**Key points:**
- Import all handlers from the handlers index
- Create instances of each handler, passing required dependencies (like `db`)
- Register all handlers using `ipcHandlerRegistry.registerHandlers()`

### 4. Register in Main API Registration

Add your domain's registration to `src/api/register.ts`:

```typescript
// src/api/register.ts
import { IPCHandlerRegistry } from 'src/ipc/IPCHandlerRegistry'
import Database from 'better-sqlite3'
import { registerUserHandlers } from './user/register'

export const registerApi = ({
  ipcHandlerRegistry,
  db,
}: {
  ipcHandlerRegistry: IPCHandlerRegistry
  db: Database.Database
}) => {
  registerUserHandlers(ipcHandlerRegistry, db)
  // Add other domain registrations here
}
```

### 5. Call API from Renderer (Optional: Create Composable)

To use the API from the Vue renderer, you can create a composable in `src/renderer/composables/{domain}/use{Domain}.ts`:

```typescript
// src/renderer/composables/user/useUser.ts
import { useMutation, useQuery } from '@tanstack/vue-query'
import { UserData } from 'src/database/models'
import { ipcService } from 'src/ipc/renderer'
import { queryClient } from 'src/renderer/query/queryClient'

const createUserQueryKey = () => ['user'] as const

// API functions
export const getSingleAppUser = async () => {
  const user = await ipcService.send('user:getSingleAppUser')
  return user
}

export const createUser = async (options: { firstName: string; lastName: string; email: string }) => {
  const user = await ipcService.send('user:create', options)
  return user
}

export const updateUser = async (options: {
  id: number
  updates: Partial<Omit<UserData, 'id' | 'createdAt'>>
}) => {
  const user = await ipcService.send('user:update', options)
  return user
}

// Composable for Vue components
export const useUser = () => {
  const { data: user, error: userError, isLoading: isUserLoading } = useQuery(
    {
      queryKey: createUserQueryKey(),
      queryFn: getSingleAppUser,
    },
    queryClient
  )

  const { mutate: createUserMutation, isPending: isCreatingUser } = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] })
    },
  }, queryClient)

  const { mutate: updateUserMutation, isPending: isUpdatingUser } = useMutation({
    mutationFn: updateUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] })
    },
  }, queryClient)

  return {
    user,
    userError,
    isUserLoading,
    createUser: createUserMutation,
    isCreatingUser,
    updateUser: updateUserMutation,
    isUpdatingUser,
  }
}
```

**Key points:**
- Use `ipcService.send()` to call handlers (it's type-safe based on `IpcChannels`)
- For queries, use `useQuery` from `@tanstack/vue-query`
- For mutations, use `useMutation` from `@tanstack/vue-query`
- Invalidate queries on mutation success to refresh data

## Complete Example: User API

Here's the complete structure of the User API:

### Handler Example: Create User

```typescript
// src/api/user/handlers/create.ts
import Database from 'better-sqlite3'
import { IpcMainEvent } from 'electron'
import { UserData, UserModel } from 'src/database/user'
import { IpcHandler } from 'src/ipc/IPCHandler'
import { IpcRequest, IpcResponse } from 'src/ipc/types'

declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'user:create': {
      request: { firstName: string; lastName: string; email: string }
      response: UserData
    }
  }
}

export class UserCreateHandler extends IpcHandler {
  static readonly channel = 'user:create' as const

  constructor(private db: Database.Database) {
    super()
  }

  async handle(
    _event: IpcMainEvent,
    request: IpcRequest<{ firstName: string; lastName: string; email: string }>
  ): Promise<IpcResponse<UserData>> {
    if (!request.params) {
      return {
        success: false,
        error: 'No parameters provided',
      }
    }

    const user = UserModel.create(this.db, request.params)
    return {
      success: true,
      data: user,
    }
  }
}
```

### Handler Example: Get User (No Params)

```typescript
// src/api/user/handlers/getSingleAppUser.ts
import Database from 'better-sqlite3'
import { IpcMainEvent } from 'electron'
import { UserData, UserModel } from 'src/database/user'
import { IpcHandler } from 'src/ipc/IPCHandler'
import { IpcRequest, IpcResponse } from 'src/ipc/types'

declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'user:getSingleAppUser': {
      request: undefined
      response: UserData
    }
  }
}

export class UserGetSingleAppUserHandler extends IpcHandler {
  static readonly channel = 'user:getSingleAppUser' as const

  constructor(private db: Database.Database) {
    super()
  }

  async handle(
    event: IpcMainEvent,
    request: IpcRequest<undefined>
  ): Promise<IpcResponse<UserData>> {
    const users = UserModel.findAll(this.db)
    const appUser = users.at(0)

    return {
      success: appUser != null,
      data: appUser,
    }
  }
}
```

### Handler Example: Update User

```typescript
// src/api/user/handlers/update.ts
import Database from 'better-sqlite3'
import { IpcMainEvent } from 'electron'
import { UserData, UserModel } from 'src/database/user'
import { IpcHandler } from 'src/ipc/IPCHandler'
import { IpcRequest, IpcResponse } from 'src/ipc/types'

declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'user:update': {
      request: { id: number; updates: Partial<Omit<UserData, 'id' | 'createdAt'>> }
      response: UserData | null
    }
  }
}

export class UserUpdateHandler extends IpcHandler {
  static readonly channel = 'user:update' as const

  constructor(private db: Database.Database) {
    super()
  }

  async handle(
    event: IpcMainEvent,
    request: IpcRequest<{ id: number; updates: Partial<Omit<UserData, 'id' | 'createdAt'>> }>
  ): Promise<IpcResponse<UserData | null>> {
    const user = UserModel.update(this.db, request.params!.id, request.params!.updates)
    return {
      success: true,
      data: user,
    }
  }
}
```

## Channel Naming Convention

Use the pattern `{domain}:{action}` for channel names:
- `user:create` - Create a user
- `user:update` - Update a user
- `user:getSingleAppUser` - Get user (specific action)
- `platform:list` - List platforms
- `platform:connect` - Connect a platform

## Response Format

All handlers must return an `IpcResponse<T>`:

```typescript
interface IpcResponse<T> {
  success: boolean
  data?: T
  error?: string
}
```

**Success response:**
```typescript
return {
  success: true,
  data: result,
}
```

**Error response:**
```typescript
return {
  success: false,
  error: 'Error message here',
}
```

## Type Safety

The type system ensures type safety across the IPC boundary:

1. **Define channel types** in each handler using module augmentation
2. **TypeScript automatically infers** request/response types in the renderer
3. **Use `ipcService.send()`** - it's fully type-safe based on channel definitions

## Best Practices

1. **Validate input** - Always check `request.params` if they're required
2. **Handle errors gracefully** - Return error responses, don't throw
3. **Use database models** - Call model methods, don't write SQL in handlers
4. **Keep handlers thin** - Business logic should be in models or services
5. **Use descriptive channel names** - Follow `{domain}:{action}` pattern
6. **Export handlers consistently** - Use index files for clean imports
7. **Type everything** - Use module augmentation for type-safe channels
8. **Handle null cases** - Return appropriate responses when data doesn't exist

## Error Handling

The `IPCHandlerRegistry` automatically catches exceptions and converts them to error responses:

```typescript
// In your handler, you can either:
// 1. Return an error response (recommended)
if (!request.params) {
  return {
    success: false,
    error: 'No parameters provided',
  }
}

// 2. Throw an error (will be caught and converted)
if (!request.params) {
  throw new Error('No parameters provided')
}
```

## Testing Your API

After creating an API:
1. Ensure handlers are registered in `register.ts`
2. Restart the application to load handlers
3. Test from the renderer using `ipcService.send()`
4. Verify type safety - TypeScript should autocomplete channel names and types
