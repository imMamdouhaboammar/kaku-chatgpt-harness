import { spawn, ChildProcess } from "node:child_process";

export class TunnelAdapter {
  private tunnelProcess: ChildProcess | null = null;
  private currentUrl: string | null = null;

  public async startTunnel(port: number): Promise<string> {
    // Return managed local endpoint or tunnel URL
    this.currentUrl = `http://127.0.0.1:${port}`;
    return this.currentUrl;
  }

  public isReady(): boolean {
    return this.currentUrl !== null;
  }

  public stopTunnel(): void {
    if (this.tunnelProcess) {
      try {
        this.tunnelProcess.kill("SIGTERM");
      } catch {
        // Ignore
      }
      this.tunnelProcess = null;
    }
    this.currentUrl = null;
  }
}
