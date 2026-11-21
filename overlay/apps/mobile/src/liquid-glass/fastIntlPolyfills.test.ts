import { describe, expect, it } from "vite-plus/test";

import { installFastIntlPolyfills } from "./fastIntlPolyfills";

describe("installFastIntlPolyfills", () => {
  it("memoizes Intl primitives while preserving spec semantics and immutability", () => {
    installFastIntlPolyfills();
    // Idempotent if invoked more than once.
    installFastIntlPolyfills();

    // 1. getCanonicalLocales returns fresh mutable copies and still rejects invalid tags.
    const c1 = Intl.getCanonicalLocales("en-us");
    expect(c1).toEqual(["en-US"]);
    c1.push("mutated");
    expect(Intl.getCanonicalLocales("en-us")).toEqual(["en-US"]);
    expect(() => Intl.getCanonicalLocales("not_a_valid_tag!!")).toThrow(RangeError);

    // 2. NumberFormat.supportedLocalesOf returns fresh copies.
    const s1 = Intl.NumberFormat.supportedLocalesOf(["en-US"]);
    expect(s1).toEqual(["en-US"]);
    s1.push("mutated");
    expect(Intl.NumberFormat.supportedLocalesOf(["en-US"])).toEqual(["en-US"]);

    // 3. Intl.Locale reuses immutable instances, caches getters/toString & preserves instanceof.
    const l1 = new Intl.Locale("en-US");
    const l2 = new Intl.Locale("en-US");
    expect(l1).toBe(l2);
    expect(l1 instanceof Intl.Locale).toBe(true);
    expect(l1.language).toBe("en");
    expect(l1.language).toBe("en");
    expect(l1.region).toBe("US");
    expect(l1.region).toBe("US");
    expect(l1.script).toBeUndefined();
    expect(l1.script).toBeUndefined();
    expect(l1.baseName).toBe("en-US");
    expect(l1.toString()).toBe("en-US");
    expect(l1.toString()).toBe("en-US");
    expect(new Intl.Locale("en", { region: "GB" }).region).toBe("GB");
    const langGetter = Object.getOwnPropertyDescriptor(Intl.Locale.prototype, "language")?.get;
    expect(() => langGetter?.call({})).toThrow(TypeError);

    // 4. Intl.PluralRules reuses instances, preserves instanceof, and selects accurately.
    const pr1 = new Intl.PluralRules("en", { type: "cardinal" });
    const pr2 = new Intl.PluralRules("en", { type: "cardinal" });
    expect(pr1).toBe(pr2);
    expect(pr1 instanceof Intl.PluralRules).toBe(true);
    expect(pr1.select(0)).toBe("other");
    expect(pr1.select(-0)).toBe("other");
    expect(pr1.select(1)).toBe("one");
    expect(pr1.select(2)).toBe("other");
    expect(pr1.select(1)).toBe("one");

    const ru = new Intl.PluralRules("ru", { type: "cardinal" });
    expect(ru.select(1)).toBe("one");
    expect(ru.select(2)).toBe("few");
    expect(ru.select(5)).toBe("many");
    expect(ru.select(21)).toBe("one");

    // 5. DisplayNames reuses instances, preserves instanceof, and caches .of lookups.
    const dn = new Intl.DisplayNames(["en"], { type: "language" });
    const dn2 = new Intl.DisplayNames(["en"], { type: "language" });
    expect(dn).toBe(dn2);
    expect(dn instanceof Intl.DisplayNames).toBe(true);
    expect(dn.of("en")).toBe("English");
    expect(dn.of("en")).toBe("English");
    expect(dn.of("fr")).toBe("French");
    expect(Intl.DisplayNames.supportedLocalesOf(["en"])).toEqual(["en"]);

    // 6. NumberFormat & DateTimeFormat reuse instances for identical primitive options.
    const nf1 = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
    const nf2 = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
    expect(nf1).toBe(nf2);
    expect(nf1.format(12.34)).toBe("12.3");

    const dtf1 = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
    const dtf2 = new Intl.DateTimeFormat("en-US", { minute: "2-digit", hour: "numeric" });
    expect(dtf1).toBe(dtf2);
    expect(dtf1 instanceof Intl.DateTimeFormat).toBe(true);
  });
});
