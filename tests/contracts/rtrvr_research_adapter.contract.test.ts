import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { generatedModulePath, importGenerated, skipReason } from "./load_generated";

// Contract tests for prompts/modules/rtrvr_research_adapter_typescript.prompt.
// Test names begin with the contract rule ID they verify (R1–R7).
// Inherited preamble rules: P1→R3, P2→R5, P3→R3/R6, P4→R6, P5→R1/R2, P6→R4, P7→R5/R7,
// P8 has a dedicated test below.

const MODULE = "rtrvr_research_adapter";
const modulePath = generatedModulePath(MODULE);
const opts = modulePath ? {} : { skip: skipReason(MODULE) };

type AnyFn = (input: unknown) => Promise<any> | any;

const FIXED_NOW = "2026-07-25T18:00:00.000Z";

const allowlist = {
  allowedHosts: ["www.sanjoseca.gov", "sanjoseca.gov"],
  allowedProtocols: ["https"] as ("http" | "https")[],
};

const targets = [
  "https://www.sanjoseca.gov/planning/example-site",
  "https://www.sanjoseca.gov/planning/example-hearing",
];

function loadFixture(name: string): unknown {
  const file = path.resolve(process.cwd(), "tests/fixtures/research", name);
  return JSON.parse(readFileSync(file, "utf8"));
}

function makeRequest(overrides: Record<string, unknown> = {}): any {
  return structuredClone({
    task: "Retrieve planning pages for Alpha site screening.",
    targets: [...targets],
    allowlist: structuredClone(allowlist),
    pageLimit: 2,
    timeoutMs: 5000,
    ...overrides,
  });
}

function installFetchStub(): () => void {
  const previous = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("live network fetch is forbidden in rtrvr contract tests");
  }) as typeof fetch;
  return () => {
    globalThis.fetch = previous;
  };
}

async function adapter(): Promise<AnyFn> {
  const mod = await importGenerated(modulePath as string);
  const fn = mod.researchWithRtrvr as AnyFn;
  assert.equal(typeof fn, "function", "module must export researchWithRtrvr");
  return fn;
}

function transportOf(body: unknown): AnyFn {
  return async () => structuredClone(body);
}

function throwingTransport(error: Error): AnyFn {
  return async () => {
    throw error;
  };
}

test("R1: valid allowlisted request reaches transport; invalid pageLimit/timeout/task reject before send", opts, async () => {
  const restore = installFetchStub();
  try {
    const research = await adapter();
    let called = 0;
    const fixture = loadFixture("rtrvr_allowlisted_success.json");

    const ok = await research({
      request: makeRequest(),
      transport: async (req: any) => {
        called += 1;
        assert.deepEqual(req.targets, targets);
        assert.equal(req.pageLimit, 2);
        assert.equal(req.timeoutMs, 5000);
        return structuredClone(fixture);
      },
      now: () => FIXED_NOW,
    });
    assert.equal(ok.status, "complete");
    assert.equal(called, 1);

    called = 0;
    const badLimit = await research({
      request: makeRequest({ pageLimit: 0 }),
      transport: async () => {
        called += 1;
        return structuredClone(fixture);
      },
      now: () => FIXED_NOW,
    });
    assert.equal(badLimit.status, "failed");
    assert.equal(badLimit.failure.code, "invalid_request");
    assert.equal(called, 0);

    called = 0;
    const overMax = await research({
      request: makeRequest({ pageLimit: 21 }), // default maxPageLimit is 20
      transport: async () => {
        called += 1;
        return structuredClone(fixture);
      },
      now: () => FIXED_NOW,
    });
    assert.equal(overMax.status, "failed");
    assert.equal(overMax.failure.code, "invalid_request");
    assert.equal(called, 0);

    called = 0;
    const badTimeout = await research({
      request: makeRequest({ timeoutMs: 60001 }), // default maxTimeoutMs is 60000
      transport: async () => {
        called += 1;
        return structuredClone(fixture);
      },
      now: () => FIXED_NOW,
    });
    assert.equal(badTimeout.status, "failed");
    assert.equal(badTimeout.failure.code, "invalid_request");
    assert.equal(called, 0);

    called = 0;
    const blankTask = await research({
      request: makeRequest({ task: "   " }),
      transport: async () => {
        called += 1;
        return structuredClone(fixture);
      },
      now: () => FIXED_NOW,
    });
    assert.equal(blankTask.status, "failed");
    assert.equal(blankTask.failure.code, "invalid_request");
    assert.equal(called, 0);
  } finally {
    restore();
  }
});

test("R2: rejects bad protocol, private/loopback/credential URLs, off-allowlist hosts, and redirect escape", opts, async () => {
  const restore = installFetchStub();
  try {
    const research = await adapter();
    const fixture = loadFixture("rtrvr_allowlisted_success.json");
    let called = 0;
    const counting = async () => {
      called += 1;
      return structuredClone(fixture);
    };

    const cases: Array<{ targets: string[]; code: string }> = [
      { targets: ["ftp://www.sanjoseca.gov/x"], code: "forbidden_target" },
      { targets: ["https://localhost/planning"], code: "forbidden_target" },
      { targets: ["https://127.0.0.1/planning"], code: "forbidden_target" },
      { targets: ["https://10.0.0.8/planning"], code: "forbidden_target" },
      { targets: ["https://192.168.1.10/planning"], code: "forbidden_target" },
      { targets: ["https://172.16.5.5/planning"], code: "forbidden_target" },
      { targets: ["https://169.254.1.1/planning"], code: "forbidden_target" },
      { targets: ["https://printer.local/planning"], code: "forbidden_target" },
      { targets: ["https://user:pass@www.sanjoseca.gov/planning"], code: "forbidden_target" },
      { targets: ["https://evil.example.com/planning"], code: "forbidden_target" },
    ];

    for (const c of cases) {
      called = 0;
      const result = await research({
        request: makeRequest({ targets: c.targets, pageLimit: 1 }),
        transport: counting,
        now: () => FIXED_NOW,
      });
      assert.equal(result.status, "failed", `expected failure for ${c.targets[0]}`);
      assert.equal(result.failure.code, c.code, `code for ${c.targets[0]}`);
      assert.equal(called, 0, `transport must not be called for ${c.targets[0]}`);
    }

    // Redirect escape: transport reports finalUrl outside allowlist.
    const escaped = await research({
      request: makeRequest({ targets: [targets[0]], pageLimit: 1 }),
      transport: async () => ({
        status: "complete",
        requestId: "rtrvr-req-redirect-001",
        pages: [
          {
            requestedUrl: targets[0],
            finalUrl: "https://evil.example.com/phish",
            title: "Escaped",
            retrievedAt: FIXED_NOW,
            contentStatus: "ok",
            content: "should not be kept as success pages when redirect escapes",
            contentRef: null,
            checksum: "sha256:redirect-escape",
          },
        ],
      }),
      now: () => FIXED_NOW,
    });
    assert.equal(escaped.status, "failed");
    assert.equal(escaped.failure.code, "redirect_escape");
    assert.ok(!("pages" in escaped) || escaped.pages === undefined);
  } finally {
    restore();
  }
});

test("R3: allowlisted success preserves URLs, titles, content status, checksum, requestId, latency (P1)", opts, async () => {
  const restore = installFetchStub();
  try {
    const research = await adapter();
    const fixture = loadFixture("rtrvr_allowlisted_success.json") as any;

    const result = await research({
      request: makeRequest(),
      transport: transportOf(fixture),
      now: () => FIXED_NOW,
    });

    assert.equal(result.status, "complete");
    assert.equal(result.requestId, "rtrvr-req-allowlisted-001");
    assert.equal(typeof result.latencyMs, "number");
    assert.ok(result.latencyMs >= 0);
    assert.equal(result.pages.length, 2);
    assert.equal(result.pages[0].requestedUrl, targets[0]);
    assert.equal(result.pages[0].finalUrl, targets[0]);
    assert.equal(result.pages[0].title, fixture.pages[0].title);
    assert.equal(result.pages[0].contentStatus, "ok");
    assert.equal(result.pages[0].checksum, "sha256:allowlisted-page-1");
    assert.equal(result.pages[1].requestedUrl, targets[1]);
    assert.equal(result.pages[1].checksum, "sha256:allowlisted-page-2");
  } finally {
    restore();
  }
});

test("R4: instruction-like retrieved content is untrusted data and does not alter policy or outcome (P6)", opts, async () => {
  const restore = installFetchStub();
  try {
    const research = await adapter();
    const hostile = loadFixture("rtrvr_allowlisted_success.json") as any;
    assert.ok(String(hostile.pages[0].content).includes("Ignore previous instructions"));

    const benign = structuredClone(hostile);
    benign.pages[0].content = "Parcel is zoned R-M. General plan designation Mixed Use.";
    benign.pages[0].checksum = "sha256:benign-page-1";

    const withInjection = await research({
      request: makeRequest(),
      transport: transportOf(hostile),
      now: () => FIXED_NOW,
    });
    const withBenign = await research({
      request: makeRequest(),
      transport: transportOf(benign),
      now: () => FIXED_NOW,
    });

    assert.equal(withInjection.status, "complete");
    assert.equal(withBenign.status, "complete");
    assert.equal(withInjection.pages.length, withBenign.pages.length);
    assert.equal(withInjection.requestId, withBenign.requestId);
    // Injection text is preserved as content data, not executed as instructions.
    assert.ok(String(withInjection.pages[0].content).includes("Ignore previous instructions"));
    assert.equal(withInjection.status, withBenign.status);
  } finally {
    restore();
  }
});

test("R5: timeout, abort, malformed body, and partial results map to typed failures/partial (P2, P7)", opts, async () => {
  const restore = installFetchStub();
  try {
    const research = await adapter();

    const timeoutErr = new Error("timed out");
    timeoutErr.name = "TimeoutError";
    const timedOut = await research({
      request: makeRequest(),
      transport: throwingTransport(timeoutErr),
      now: () => FIXED_NOW,
    });
    assert.equal(timedOut.status, "failed");
    assert.equal(timedOut.failure.code, "timeout");

    const abortErr = new Error("aborted");
    abortErr.name = "AbortError";
    const aborted = await research({
      request: makeRequest(),
      transport: throwingTransport(abortErr),
      now: () => FIXED_NOW,
    });
    assert.equal(aborted.status, "failed");
    assert.equal(aborted.failure.code, "caller_abort");

    const otherErr = new Error("upstream 503");
    const providerFail = await research({
      request: makeRequest(),
      transport: throwingTransport(otherErr),
      now: () => FIXED_NOW,
    });
    assert.equal(providerFail.status, "failed");
    assert.equal(providerFail.failure.code, "provider_failure");

    const malformed = await research({
      request: makeRequest(),
      transport: transportOf(loadFixture("rtrvr_malformed.json")),
      now: () => FIXED_NOW,
    });
    assert.equal(malformed.status, "failed");
    assert.equal(malformed.failure.code, "invalid_provider_response");

    const notObject = await research({
      request: makeRequest(),
      transport: async () => "not-an-object",
      now: () => FIXED_NOW,
    });
    assert.equal(notObject.status, "failed");
    assert.equal(notObject.failure.code, "invalid_provider_response");

    const partial = await research({
      request: makeRequest(),
      transport: transportOf(loadFixture("rtrvr_partial.json")),
      now: () => FIXED_NOW,
    });
    assert.equal(partial.status, "partial");
    assert.equal(partial.pages.length, 1);
    assert.equal(partial.pages[0].requestedUrl, targets[0]);
    assert.equal(partial.requestId, "rtrvr-req-partial-001");
  } finally {
    restore();
  }
});

test("R6: deterministic ordering, deep input immutability, identical recorded responses (P3, P4)", opts, async () => {
  const restore = installFetchStub();
  try {
    const research = await adapter();
    const fixture = loadFixture("rtrvr_allowlisted_success.json");
    const request = makeRequest();
    const snapshot = structuredClone(request);

    const first = await research({
      request,
      transport: transportOf(fixture),
      now: () => FIXED_NOW,
    });
    const second = await research({
      request: makeRequest(),
      transport: transportOf(fixture),
      now: () => FIXED_NOW,
    });

    assert.deepEqual(request, snapshot, "input request must not be mutated");
    assert.deepEqual(
      first.pages.map((p: any) => p.requestedUrl),
      targets,
    );
    // Strip latencyMs for structural equality if clock-based measurement differs by 0..n ms
    // but with injected now and sync fixture, full equality is expected when latency is stable.
    assert.equal(first.status, second.status);
    assert.deepEqual(first.pages, second.pages);
    assert.equal(first.requestId, second.requestId);
    assert.deepEqual(first.diagnostics, second.diagnostics);
  } finally {
    restore();
  }
});

test("R7 (negative): no findings/scores/finance/secrets; generated source has no Rtrvr SDK imports", opts, async () => {
  const restore = installFetchStub();
  try {
    const research = await adapter();
    const result = await research({
      request: makeRequest(),
      transport: transportOf(loadFixture("rtrvr_allowlisted_success.json")),
      now: () => FIXED_NOW,
    });

    const json = JSON.stringify(result);
    assert.ok(!/"findings"\s*:/.test(json), "must not produce findings");
    assert.ok(!/"score"\s*:/.test(json), "must not produce scores");
    assert.ok(!/"finance"\s*:/.test(json), "must not produce finance outputs");
    assert.ok(!/api[_-]?key/i.test(json), "must not leak api keys");
    assert.ok(!/authorization/i.test(json), "must not leak authorization material");
    assert.ok(!/Bearer\s+/i.test(json), "must not leak bearer tokens");

    const source = readFileSync(modulePath as string, "utf8");
    assert.ok(!/from\s+['"]@rtrvr/i.test(source), "must not import @rtrvr packages");
    assert.ok(!/require\(\s*['"]@rtrvr/i.test(source), "must not require @rtrvr packages");
    assert.ok(!/from\s+['"]rtrvr/i.test(source), "must not import rtrvr SDK");
  } finally {
    restore();
  }
});

test("P8: the result is plain, JSON-serializable data with no provider types", opts, async () => {
  const restore = installFetchStub();
  try {
    const research = await adapter();
    const result = await research({
      request: makeRequest(),
      transport: transportOf(loadFixture("rtrvr_allowlisted_success.json")),
      now: () => FIXED_NOW,
    });
    assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  } finally {
    restore();
  }
});
