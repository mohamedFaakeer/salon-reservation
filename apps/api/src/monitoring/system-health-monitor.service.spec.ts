import type { DataSource } from "typeorm";
import { SystemHealthMonitorService } from "./system-health-monitor.service";
import type { PlatformAlertService } from "../alerting/platform-alert.service";

function build(query: () => Promise<unknown>) {
  const dataSource = { query: vi.fn(query) } as unknown as DataSource;
  const alerts = { send: vi.fn(async () => undefined) } as unknown as PlatformAlertService;
  const service = new SystemHealthMonitorService(dataSource, alerts);
  return { service, alerts };
}

describe("SystemHealthMonitorService", () => {
  it("does not alert while the database stays healthy", async () => {
    const { service, alerts } = build(async () => [{ "?column?": 1 }]);

    await service.checkDatabaseHealth();
    await service.checkDatabaseHealth();

    expect(alerts.send).not.toHaveBeenCalled();
  });

  it("alerts once on the transition from healthy to unhealthy, not on every subsequent tick", async () => {
    const { service, alerts } = build(async () => {
      throw new Error("connection refused");
    });

    await service.checkDatabaseHealth();
    await service.checkDatabaseHealth();
    await service.checkDatabaseHealth();

    expect(alerts.send).toHaveBeenCalledTimes(1);
    expect(alerts.send).toHaveBeenCalledWith("Database unreachable", expect.any(String));
  });

  it("alerts again on recovery", async () => {
    let healthy = false;
    const dataSource = {
      query: vi.fn(async () => {
        if (!healthy) throw new Error("connection refused");
        return [{ "?column?": 1 }];
      }),
    } as unknown as DataSource;
    const alerts = { send: vi.fn(async () => undefined) } as unknown as PlatformAlertService;
    const service = new SystemHealthMonitorService(dataSource, alerts);

    await service.checkDatabaseHealth();
    healthy = true;
    await service.checkDatabaseHealth();

    expect(alerts.send).toHaveBeenCalledTimes(2);
    expect(alerts.send).toHaveBeenNthCalledWith(1, "Database unreachable", expect.any(String));
    expect(alerts.send).toHaveBeenNthCalledWith(2, "Database reachable again", expect.any(String));
  });
});
