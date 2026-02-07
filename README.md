# Community API

A comprehensive backend API for a Reddit-like community application built with Next.js, Firebase, and Open Policy Agent (OPA) for authorization.

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Database**: Firebase Firestore
- **Authentication**: Firebase Auth
- **Authorization**: Open Policy Agent (OPA)
- **Validation**: Zod

## Features

- 🔐 **Authentication & Authorization** - Firebase Auth + OPA policies
- 👤 **Users** - Registration, profiles, follow/unfollow, ban/suspend
- 📝 **Posts** - CRUD, voting, bookmarks, reports, media support
- 💬 **Comments** - Threaded comments (10 levels), voting
- 🏘️ **Communities** - Create, join, moderation, role-based access
- 🔔 **Notifications** - Real-time notifications with read status
- 🔍 **Search** - Search posts, users, communities
- 📈 **Trending** - Trending content by timeframe
- 🛡️ **Admin** - Report management, moderation tools

## API Endpoints

### Users (14 endpoints)
- `GET/POST /api/users` - List/Create users
- `GET/PATCH/DELETE /api/users/[id]` - User CRUD
- `POST/DELETE /api/users/[id]/ban` - Ban/Unban
- `POST/DELETE /api/users/[id]/suspend` - Suspend/Unsuspend
- `POST/DELETE /api/users/[id]/follow` - Follow/Unfollow
- `GET /api/users/[id]/followers` - List followers
- `GET /api/users/[id]/following` - List following
- `POST /api/users/[id]/report` - Report user

### Posts (10 endpoints)
- `GET/POST /api/posts` - List/Create posts
- `GET/PATCH/DELETE /api/posts/[id]` - Post CRUD
- `POST/DELETE /api/posts/[id]/vote` - Vote/Unvote
- `POST/DELETE /api/posts/[id]/bookmark` - Bookmark/Unbookmark
- `POST /api/posts/[id]/report` - Report post
- `GET /api/posts/[id]/comments` - List comments

### Comments (7 endpoints)
- `POST /api/comments` - Create comment/reply
- `GET/PATCH/DELETE /api/comments/[id]` - Comment CRUD
- `POST/DELETE /api/comments/[id]/vote` - Vote/Unvote

### Communities (12 endpoints)
- `GET/POST /api/communities` - List/Create communities
- `GET/PATCH/DELETE /api/communities/[id]` - Community CRUD
- `POST/DELETE /api/communities/[id]/join` - Join/Leave
- `GET /api/communities/[id]/members` - List members
- `POST/DELETE /api/communities/[id]/moderators` - Add/Remove moderator
- `POST/DELETE /api/communities/[id]/ban` - Ban/Unban user

### Additional (7 endpoints)
- `GET /api/feed` - Personalized home feed
- `GET /api/search` - Search content
- `GET/PATCH /api/notifications` - Notifications
- `GET /api/trending` - Trending content
- `GET/PATCH /api/admin/reports` - Admin reports

## Getting Started

### Prerequisites

- Node.js 18+
- Firebase project with Firestore and Auth enabled
- OPA server (optional, for policy evaluation)

### Installation

```bash
npm install
```

### Environment Variables

Create `.env.local`:

```env
# Firebase Client
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Firebase Admin
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

# OPA
OPA_URL=http://localhost:8181
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

## Project Structure

```
src/
├── app/api/           # API routes
│   ├── users/
│   ├── posts/
│   ├── comments/
│   ├── communities/
│   ├── feed/
│   ├── search/
│   ├── notifications/
│   ├── trending/
│   └── admin/
├── lib/
│   ├── api/           # API utilities
│   ├── db/            # Database helpers
│   ├── firebase/      # Firebase config
│   └── opa/           # OPA authorization
├── services/
│   ├── opa/           # OPA service
│   └── repositories/  # Data repositories
└── types/
    ├── api/           # API schemas
    └── models/        # Data models
opa/
└── authz.rego         # OPA policies
```

## License

MIT
