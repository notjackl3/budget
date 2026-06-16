import { describe, it, expect } from "vitest";
import {
  parseAlertEmail,
  looksLikeCibcAlert,
} from "@/lib/parse-alert-email";

// NOTE: these fixtures are SYNTHETIC, modelled on CIBC's typical alert wording.
// When a real alert from the account lands, add its plain-text body here so the
// regexes are validated against ground truth.

describe("parseAlertEmail", () => {
  it("parses a standard charge alert", () => {
    const body =
      "A transaction of $42.50 was charged to your CIBC Dividend Visa card " +
      "ending in 1234 at TIM HORTONS #4021 on June 16, 2026.";
    expect(parseAlertEmail(body)).toEqual({
      date: "2026-06-16",
      description: "TIM HORTONS #4021",
      amountCents: 4250,
    });
  });

  it("handles thousands separators and an HTML body", () => {
    const body =
      "<p>You spent <b>$1,299.00</b> at APPLE STORE on Jun 3, 2026 " +
      "on your CIBC card.</p>";
    expect(parseAlertEmail(body)).toEqual({
      date: "2026-06-03",
      description: "APPLE STORE",
      amountCents: 129900,
    });
  });

  it("treats refunds/reversals as negative (income side)", () => {
    const body =
      "A refund of $20.00 was credited to your CIBC card at AMAZON on " +
      "May 30, 2026.";
    const parsed = parseAlertEmail(body);
    expect(parsed?.amountCents).toBe(-2000);
    expect(parsed?.description).toContain("AMAZON");
  });

  it("falls back to received date when the alert omits one", () => {
    const body = "A transaction of $9.99 was charged at NETFLIX.COM";
    const parsed = parseAlertEmail(body, {
      referenceDate: new Date(2026, 5, 16), // June 16, 2026 (month is 0-based)
    });
    expect(parsed).toEqual({
      date: "2026-06-16",
      description: "NETFLIX.COM",
      amountCents: 999,
    });
  });

  it("returns null when there is no amount", () => {
    expect(parseAlertEmail("Your statement is ready to view.")).toBeNull();
  });

  it("returns null when there is no date and no reference date", () => {
    expect(parseAlertEmail("A transaction of $9.99 was charged at NETFLIX")).toBeNull();
  });

  it("does not throw on garbage", () => {
    expect(() => parseAlertEmail(" ￿ random ☃ text $ ")).not.toThrow();
    expect(parseAlertEmail("nothing here")).toBeNull();
  });
});

// A REAL CIBC alert captured 2026-06-16. The poller feeds the parser the
// SUBJECT + sender + body combined (as Composio returns them), so the fixture
// includes the subject line — which contains "credit card" and must NOT be
// misread as a refund. Note the body carries NO transaction date, so the parser
// falls back to the email's received date. Ground truth for the regexes.
const REAL_ALERT_2026_06_16 = `New purchase on your credit card
Mailbox.noreply@cibc.com
<?xml version="1.0" encoding="ISO-8859-1"?><html><head/><body><p>Dear Huu an duc,
      </p><p>You've recently made a purchase with your CIBC Dividend Visa Card ending in 5175 for $124.30 at SP DRMERS CLOTHING.<br/>You can sign on to your <a href="https://www.cibc.com/en/personal-banking.html">CIBC Online or Mobile Banking</a> to view more details about this transaction.</p><p>Sincerely,<br/>CIBC</p></body></html>`;

describe("parseAlertEmail — real CIBC fixtures", () => {
  it("parses the 2026-06-16 'New purchase' alert (no date in body)", () => {
    const parsed = parseAlertEmail(REAL_ALERT_2026_06_16, {
      referenceDate: new Date(2026, 5, 16, 15, 18), // email received time
    });
    expect(parsed).toEqual({
      date: "2026-06-16",
      description: "SP DRMERS CLOTHING",
      amountCents: 12430,
    });
  });

  it("recognizes the real alert as a CIBC alert", () => {
    expect(looksLikeCibcAlert(REAL_ALERT_2026_06_16)).toBe(true);
  });
});

describe("looksLikeCibcAlert", () => {
  it("accepts a real-looking alert", () => {
    expect(
      looksLikeCibcAlert(
        "CIBC: a transaction of $5.00 was charged at STARBUCKS on Jun 1, 2026.",
      ),
    ).toBe(true);
  });

  it("rejects unrelated mail", () => {
    expect(looksLikeCibcAlert("Your Amazon order has shipped.")).toBe(false);
    expect(looksLikeCibcAlert("CIBC newsletter — no dollar figures here")).toBe(false);
  });
});
