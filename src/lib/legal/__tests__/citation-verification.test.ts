// Regression tests for verifyStatutoryCitation() — the deterministic check
// added per the "never generate Exact Text from model memory" requirement
// (see mexico-lock.ts GROUNDING_CONTRACT rule 6). Exercises the real
// function against a fake db modeling public.legal_authorities /
// legal_articles, asserting it never marks a citation VERIFIED unless every
// check that could run actually passed.
import { describe, it, expect } from "vitest";
import { verifyStatutoryCitation } from "@/lib/legal/citation-verification.server";
import {sha256Hex} from '../../intelligence/evidence-provenance.server';

const ARTICLE_BODY =
  "A ninguna ley se dará efecto retroactivo en perjuicio de persona alguna. Nadie podrá ser privado de la libertad o de sus propiedades, posesiones o derechos, sino mediante juicio seguido ante los tribunales previamente establecidos.";

function makeFakeDb(opts: {
  authorities?: Array<{ id: string; title: string; short_title: string | null; citation: string | null; jurisdiction: string | null; verification_status?:string; source_url?:string; content_hash?:string;body?:string }>;
  article?: {
    id: string;
    article_number: string;
    body: string;
    effective_at: string | null;
    repealed_at: string | null;
    verification_status: string;
  } | null;
}) {
  return {
    from(table: string) {
      if (table === "legal_authorities") {
        return {
          select: () => ({
            or: () => ({
              limit: async () => ({ data: opts.authorities ?? [], error: null }),
            }),
          }),
        };
      }
      if (table === "legal_articles") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: opts.article ?? null, error: null }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table in test fake db: ${table}`);
    },
  };
}

const CPEUM = { id: "auth-1", title: "Constitución Política de los Estados Unidos Mexicanos", short_title: "CPEUM", citation: "CPEUM", jurisdiction: "federal",verification_status:'verified',source_url:'https://official.example/cpeum',body:ARTICLE_BODY,content_hash:sha256Hex(ARTICLE_BODY) };

it('rejects authority text changed without a new verified hash',async()=>{
 const db=makeFakeDb({authorities:[{...CPEUM,body:'Changed source'}],article:{id:'a',article_number:'14',body:ARTICLE_BODY,effective_at:'1917-05-01',repealed_at:null,verification_status:'verified'}});
 expect((await verifyStatutoryCitation(db as never,{authorityHint:'CPEUM',articleNumber:'14',caseDate:'2024-01-01'})).status).toBe('UNVERIFIED');
});

it.each(['pending','superseded','failed_verification'])('rejects %s parent despite verified article',async verification_status=>{
 const db=makeFakeDb({authorities:[{...CPEUM,verification_status}],article:{id:'a',article_number:'14',body:ARTICLE_BODY,effective_at:'1917-05-01',repealed_at:null,verification_status:'verified'}});
 expect((await verifyStatutoryCitation(db as never,{authorityHint:'CPEUM',articleNumber:'14',caseDate:'2024-01-01'})).status).toBe('UNVERIFIED');
});
it('does not choose the first of ambiguous instruments',async()=>{
 const db=makeFakeDb({authorities:[CPEUM,{...CPEUM,id:'other'}],article:{id:'a',article_number:'14',body:ARTICLE_BODY,effective_at:'1917-05-01',repealed_at:null,verification_status:'verified'}});
 const result=await verifyStatutoryCitation(db as never,{authorityHint:'CPEUM',articleNumber:'14',caseDate:'2024-01-01'});
 expect(result.status).toBe('UNVERIFIED');expect(result.reasons.join(' ')).toMatch(/ambiguous/i);
});

describe("verifyStatutoryCitation", () => {
  it("returns UNVERIFIED when the statute is not found in the corpus", async () => {
    const db = makeFakeDb({ authorities: [] });
    const result = await verifyStatutoryCitation(db as never, { authorityHint: "CPEUM", articleNumber: "14" });
    expect(result.status).toBe("UNVERIFIED");
    expect(result.matched_authority_id).toBeNull();
  });

  it("returns UNVERIFIED when the statute matches but the article number does not exist", async () => {
    const db = makeFakeDb({ authorities: [CPEUM], article: null });
    const result = await verifyStatutoryCitation(db as never, { authorityHint: "CPEUM", articleNumber: "9999" });
    expect(result.status).toBe("UNVERIFIED");
    expect(result.matched_authority_id).toBe("auth-1");
    expect(result.matched_article_id).toBeNull();
  });

  it("returns VERIFIED when statute, article, source verification, vigency, and exact quote all match", async () => {
    const db = makeFakeDb({
      authorities: [CPEUM],
      article: {
        id: "art-14",
        article_number: "14",
        body: ARTICLE_BODY,
        effective_at: "1917-05-01",
        repealed_at: null,
        verification_status: "verified",
      },
    });
    const result = await verifyStatutoryCitation(db as never, {
      authorityHint: "CPEUM",
      articleNumber: "14",
      claimedText: "A ninguna ley se dará efecto retroactivo en perjuicio de persona alguna.",
      caseDate: "2024-01-01",
    });
    expect(result.status).toBe("VERIFIED");
    expect(result.quote_match).toBe(true);
    expect(result.temporal_status).toBe("in_force");
  });

  it("returns UNVERIFIED when the claimed exact text does not appear in the article body (invented quote)", async () => {
    const db = makeFakeDb({
      authorities: [CPEUM],
      article: {
        id: "art-14",
        article_number: "14",
        body: ARTICLE_BODY,
        effective_at: "1917-05-01",
        repealed_at: null,
        verification_status: "verified",
      },
    });
    const result = await verifyStatutoryCitation(db as never, {
      authorityHint: "CPEUM",
      articleNumber: "14",
      claimedText: "Este texto no aparece en el artículo real y fue inventado por el modelo.",
      caseDate: "2024-01-01",
    });
    expect(result.status).toBe("UNVERIFIED");
    expect(result.quote_match).toBe(false);
  });

  it("returns UNVERIFIED when the matched article's own source verification_status is still pending", async () => {
    const db = makeFakeDb({
      authorities: [CPEUM],
      article: {
        id: "art-14",
        article_number: "14",
        body: ARTICLE_BODY,
        effective_at: "1917-05-01",
        repealed_at: null,
        verification_status: "pending",
      },
    });
    const result = await verifyStatutoryCitation(db as never, {
      authorityHint: "CPEUM",
      articleNumber: "14",
      caseDate: "2024-01-01",
    });
    expect(result.status).toBe("UNVERIFIED");
  });

  it("returns UNVERIFIED and flags expired when the article was repealed before the case's relevant date", async () => {
    const db = makeFakeDb({
      authorities: [CPEUM],
      article: {
        id: "art-14-old",
        article_number: "14",
        body: ARTICLE_BODY,
        effective_at: "1917-05-01",
        repealed_at: "2010-01-01",
        verification_status: "verified",
      },
    });
    const result = await verifyStatutoryCitation(db as never, {
      authorityHint: "CPEUM",
      articleNumber: "14",
      caseDate: "2024-01-01",
    });
    expect(result.status).toBe("UNVERIFIED");
    expect(result.temporal_status).toBe("expired");
  });
});

it('does not invent a 1900 effective date when source metadata is missing', async () => {
 const db = makeFakeDb({authorities:[CPEUM],article:{id:'art-14',article_number:'14',body:ARTICLE_BODY,effective_at:null,repealed_at:null,verification_status:'verified'}});
 const result=await verifyStatutoryCitation(db as never,{authorityHint:'CPEUM',articleNumber:'14',caseDate:'2024-01-01'});
 expect(result.status).toBe('UNVERIFIED');expect(result.temporal_status).toBe('unknown');
});
it('keeps malformed source dates unresolved', async () => {
 const db=makeFakeDb({authorities:[CPEUM],article:{id:'a',article_number:'14',body:ARTICLE_BODY,effective_at:'unknown',repealed_at:null,verification_status:'verified'}});
 const result=await verifyStatutoryCitation(db as never,{authorityHint:'CPEUM',articleNumber:'14',caseDate:'2024-01-01'});
 expect(result.status).toBe('UNVERIFIED');expect(result.temporal_status).toBe('unknown');
});
