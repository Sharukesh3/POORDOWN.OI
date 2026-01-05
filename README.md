# Monopoly Game Project

A full-stack implementation of the classic board game Monopoly, featuring real-time multiplayer gameplay using WebSockets.

## Project Structure

- **client/**: React-based frontend application.
- **server/**: Node.js/Express backend with Socket.IO for game logic.
- **shared/**: Shared types and utilities.

## Prerequisities

- Node.js (v14 or higher)
- npm (v6 or higher)

## Getting Started

### 1. Install Dependencies

You need to install dependencies for both individual packages (Client and Server).

#### Server
```bash
cd server
npm install
```

#### Client
```bash
cd client
npm install
```

### 2. Running the Application

To start the development servers:

#### Start Server
In one terminal:
```bash
cd server
npm run dev
```
The server will start on port 3000 (default).

#### Start Client
In another terminal:
```bash
cd client
npm run dev
```
The client will start, usually on port 5173 (Vite default).

## Features

- Real-time multiplayer support.
- Property trading, buying, and auctions.
- Chat functionality.
- Smooth animations and interactive board.

## Deployment

Refer to `DEPLOYMENT.md` for details on how to deploy this application using Nginx.
