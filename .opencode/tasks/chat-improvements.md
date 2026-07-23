# Chat Improvements — Anchored Summary

## Objective
Fix WhatsApp media display in production, add fullscreen image viewer with zoom/pan, add advisor profile photos with upload in status drawer, and improve routes & security.

## Completed

### 1. WhatsApp Image Viewer (Zoom/Pan)
- **advisor:** `whatsapp.ts`, `whatsapp.html`, `whatsapp.scss` — zoom (scroll), pan (drag), double-click toggle, pinch-to-zoom
- **admin:** `whatsapp-admin.ts`, `whatsapp-admin.html`, `whatsapp-admin.scss` — same

### 2. MIME Types for Static Files
- **`backend/src/main.ts`** — explicit mimeMap passed to `useStaticAssets.setHeaders` using file extension

### 3. Profile Photo — Backend
- **`user.entity.ts`** — added `profile_photo_url` column
- **`advisors.controller.ts`** — `PATCH :id/photo` (Multer, 5MB, images only), `DELETE :id/photo`
- **`advisors.service.ts`** — `updatePhoto()`, added `profilePhotoUrl` to `findAll`/`findAllPaginated`/`findById` selects
- **`auth.service.ts`** — login response now includes `profilePhotoUrl`

### 4. Profile Photo — Frontend
- **`user.model.ts`** — `profilePhotoUrl?: string`
- **`admin.service.ts`** — `uploadPhoto(id, file)`, `deletePhoto(id)`
- **`auth.service.ts`** — `updateUser(user)` method added
- **`dashboard.component.ts`** — `onProfilePhotoSelected()`, `removeProfilePhoto()`, injects `AdminService`
- **`dashboard.component.html`** — avatar shows `<img>` with fallback; drawer has photo section with camera overlay, file input, delete button
- **`dashboard.component.scss`** — styles for `.profile-avatar-img`, `.drawer-photo-section`, `.profile-photo-wrap`, `.photo-input-hidden`, `.photo-remove-btn`

### 5. Route & Security Improvements
- **`deploy/nginx-host.conf`**:
  - Added `location = /agora` → `301 /agora/` redirect (prevents 404 on bare `/agora`)
  - Changed `/uploads/` to proxy directly to backend (`127.0.0.1:3001`) instead of frontend — one less hop for all media
  - Added catch-all `location / { return 404 }` for paths not explicitly handled
  - Kept `/agora/` → frontend and `/socket.io/` → frontend unchanged

## Key Architecture Decisions
- Profile photos stored in `uploads/profiles/` on backend filesystem, served via backend's static assets
- Photo URLs use absolute APP_URL (e.g., `https://innoovacloud.com/uploads/profiles/xxx.jpg`)
- Uploads now go directly Host → Backend, not through Frontend container
- SPA routes still go through Frontend Nginx for proper `index.html` fallback
- API calls from Angular go `/agora/...` → Host → Frontend Nginx → Backend

## Files Modified
```
backend/src/main.ts                          — MIME map for static files
backend/src/advisors/advisors.service.ts     — profilePhotoUrl in selects, updatePhoto()
backend/src/advisors/advisors.controller.ts  — uploadPhoto/deletePhoto endpoints
backend/src/auth/auth.service.ts             — login returns profilePhotoUrl
backend/src/auth/entities/user.entity.ts     — profilePhotoUrl column
frontend/src/app/core/models/user.model.ts    — profilePhotoUrl field
frontend/src/app/core/services/admin.service.ts — uploadPhoto/deletePhoto methods
frontend/src/app/core/services/auth.service.ts  — updateUser() method
frontend/src/app/features/advisor/dashboard/dashboard.component.ts  — photo upload/delete handlers
frontend/src/app/features/advisor/dashboard/dashboard.component.html — photo UI in sidebar + drawer
frontend/src/app/features/advisor/dashboard/dashboard.component.scss  — photo styles
frontend/src/app/features/advisor/modules/whatsapp/whatsapp.ts     — zoom/pan handlers
frontend/src/app/features/advisor/modules/whatsapp/whatsapp.html   — media-backdrop template
frontend/src/app/features/advisor/modules/whatsapp/whatsapp.scss   — zoom viewer styles
frontend/src/app/features/admin/modules/whatsapp/whatsapp-admin.ts     — zoom/pan handlers
frontend/src/app/features/admin/modules/whatsapp/whatsapp-admin.html   — media-backdrop template
frontend/src/app/features/admin/modules/whatsapp/whatsapp-admin.scss   — zoom viewer styles
deploy/nginx-host.conf                       — /agora redirect, /uploads direct to backend, catch-all 404
```

## Next Steps for Deployment
1. Copy `deploy/nginx-host.conf` to server and reload nginx
2. Rebuild and restart containers (`docker-compose up -d --build`)
3. Verify: profile photo upload in drawer, WhatsApp media displays in chats, deep links work
4. Verify the `uploads/` volume mounts correctly in docker-compose so profile photos persist
