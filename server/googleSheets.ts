import { google } from "googleapis";
import { getEnv } from "./_core/env";
import * as tokenStore from "./tokenStore";

export async function exportPortfolioToSheets(userId: number, assets: any[], cashPositions: any[]) {
  const tokens = tokenStore.getTokens(userId);
  if (!tokens || !tokens.accessToken) {
    throw new Error("Google session expired. Please sign out and sign in again with Google to enable export.");
  }

  const env = getEnv();
  const oauth2Client = new google.auth.OAuth2(
    env.googleOAuthClientId,
    env.googleOAuthClientSecret
  );

  oauth2Client.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
  });

  // Handle token refreshing automatically
  oauth2Client.on("tokens", (newTokens) => {
    if (newTokens.access_token) {
      tokenStore.saveTokens(
        userId, 
        newTokens.access_token, 
        newTokens.refresh_token || tokens.refreshToken, 
        newTokens.expiry_date ? Math.floor((newTokens.expiry_date - Date.now()) / 1000) : 3600
      );
    }
  });

  const sheets = google.sheets({ version: "v4", auth: oauth2Client });

  // 1. Create a new spreadsheet
  const spreadsheet = await sheets.spreadsheets.create({
    requestBody: {
      properties: {
        title: `Portfolio Overview - ${new Date().toLocaleDateString()}`,
      },
    },
  });

  const spreadsheetId = spreadsheet.data.spreadsheetId;
  if (!spreadsheetId) throw new Error("Failed to create spreadsheet");

  // 2. Prepare data for "Assets" sheet
  const assetRows = [
    ["Symbol", "Name", "Quantity", "Avg Cost", "Total Cost", "Current Price", "Market Value", "Gain/Loss", "Gain/Loss %", "Annual Dividend/Share", "Yield %", "Total Annual Div"],
    ...assets.map(a => [
      a.symbol,
      a.name,
      a.quantity,
      a.avgCost,
      a.totalCost,
      a.currentPrice,
      a.mktValue,
      a.gainLoss,
      a.gainLossPercent / 100,
      a.annualDividendPerShare,
      a.divYield / 100,
      a.projectedDividend
    ])
  ];

  // 3. Prepare data for "Cash" sheet
  const cashRows = [
    ["Portfolio", "Account", "Type", "Balance"],
    ...cashPositions.map(c => [
      c.portfolioName,
      c.accountName,
      c.accountType,
      c.amount
    ])
  ];

  // 4. Update the first sheet (Assets)
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "Sheet1!A1",
    valueInputOption: "RAW",
    requestBody: { values: assetRows },
  });

  // Rename Sheet1 to Assets and Add Cash sheet
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          updateSheetProperties: {
            properties: { sheetId: 0, title: "Assets" },
            fields: "title",
          },
        },
        {
          addSheet: { properties: { title: "Cash" } },
        }
      ],
    },
  });

  // 5. Update the Cash sheet
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "Cash!A1",
    valueInputOption: "RAW",
    requestBody: { values: cashRows },
  });

  return {
    spreadsheetId,
    spreadsheetUrl: spreadsheet.data.spreadsheetUrl,
  };
}
