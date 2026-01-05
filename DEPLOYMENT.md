# Deployment Guide for Poordown.oi (Windows + Nginx)

Follow these steps to let your friends play the game!

## 1. Prerequisites

1.  **Node.js**: You already have this.
2.  **Nginx for Windows**:
    *   Download the zip from: [http://nginx.org/en/download.html](http://nginx.org/en/download.html) (Get the Mainline version).
    *   Extract the `nginx` folder to somewhere simple, like `C:\nginx`.

## 2. Setup Nginx

1.  Locate the generated `nginx.conf` file in your project root:
    *   `c:\profolders\Collage stuff\Kanthan challenges\monopoly\nginx.conf`
2.  Copy this file and replace the existing `conf/nginx.conf` inside your Nginx folder (`C:\nginx\conf\nginx.conf`).

## 3. Deployment Steps

1.  **Build the Game (Client)**:
    *   Open terminal in `client` folder.
    *   Run: `npm run build`
    *   This creates a `dist` folder with the optimized game.
    *   *Note: Ensure the path in nginx.conf matches your actual dist location. I configured it for:*
        `C:/profolders/Collage stuff/Kanthan challenges/monopoly/client/dist`

2.  **Start the Server (Backend)**:
    *   Open terminal in `server` folder.
    *   Run: `npm start` (or keep `npm run dev` running).
    *   The backend MUST be running on port **3001**.

3.  **Start Nginx**:
    *   Open the `C:\nginx` folder.
    *   Double-click `nginx.exe`.
    *   It runs in the background. Go to [http://localhost:8080](http://localhost:8080) to test.

## 4. Letting Friends Play

For friends to access it, they need to connect to your IP address.

1.  Find your Local IP:
    *   Open Command Prompt (`cmd`).
    *   Type `ipconfig`.
    *   Look for "IPv4 Address" (e.g., `192.168.1.5`).
2.  Friends should type `http://192.168.1.5:8080` in their browser.
3.  **Important**: You might need to allow port 8080 through Windows Firewall.

### Option B: Internet Access (Ngrok)
If they are not on your wifi, use **ngrok**:
1.  Download ngrok.
2.  Run: `ngrok http 8080`
3.  Send them the link ngrok gives you!
