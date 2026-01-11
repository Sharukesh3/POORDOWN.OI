import { io, Socket } from 'socket.io-client';

// In production (Nginx), we use relative path so it goes through the same domain/tunnel.
// In development, we point directly to the dedicated backend port.
const URL = import.meta.env.PROD 
  ? 'https://api.poordown.backend.sharukesh.tech' 
  : 'http://localhost:3001';

export const socket: Socket = io(URL, {
    autoConnect: false
});
