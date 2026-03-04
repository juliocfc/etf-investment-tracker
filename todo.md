# ETF Investment Tracker - TODO

Core web app completed with cyberpunk design. Remaining: static results webpage.

## Backend Infrastructure
- [x] Database schema: ETF holdings, price history, dividend history, cash balance
- [x] API integration with financial data provider (Alpha Vantage)
- [x] tRPC procedures for ETF CRUD operations
- [x] tRPC procedures for price fetching and caching
- [x] tRPC procedures for dividend data fetching
- [x] Performance calculation procedures (daily, monthly, 1Y, 3Y returns)
- [x] Balance tracking and historical data procedures
- [x] Vitest unit tests for backend logic

## Frontend Design System
- [x] Cyberpunk color palette (neon pink, electric cyan, deep black)
- [x] Global CSS with neon glow effects and geometric styling
- [x] HUD-style UI components with corner brackets and technical lines
- [x] Dashboard layout with sidebar navigation

## Portfolio Management UI
- [x] ETF holdings list with add/edit/delete functionality
- [x] Cash balance management (add/edit cash available)
- [x] Portfolio summary cards (total value, allocation breakdown)
- [x] Real-time price updates display

## Performance Charts
- [x] Price change chart (1 month, 1 year, 3 years)
- [x] Balance change chart over time
- [x] Daily and monthly performance metrics display
- [x] Interactive chart controls and time period selection

## Dividend Tracking
- [x] Dividend history display
- [x] Estimated future dividend income calculation
- [x] Dividend tracking dashboard

## Static Interactive Webpage
- [x] Create static HTML/CSS/JS webpage for results presentation
- [x] Interactive charts and visualizations
- [x] Data export/share functionality

## Deployment & Testing
- [ ] End-to-end testing of all features
- [ ] Checkpoint and deployment

## User-Requested Improvements
- [x] Auto-fetch ETF name when symbol is entered
- [x] Show total gain calculation (position size × (current price - purchase price))
- [x] Improve color readability - adjust neon cyan contrast

## Bug Fixes
- [x] Fix ETF name fetching error when entering symbol (SCHD, SPY)
- [x] Improve summary card text readability - blue neon still hard to read

## Additional Bug Fixes
- [x] Auto-fetch current ETF price when adding or updating
- [x] Update total value in real-time when ETF holdings change
- [x] Use 3 decimal places for quantity and current price
- [x] Fix ETF name auto-fetch (still not working after symbol entry)

## Critical Bug Fixes
- [x] Fix React error #185 when entering ETF symbol (hook dependency issue)

## Current Issues
- [x] ETF name not updating when symbol is entered (fixed - changed to publicProcedure)
- [x] ETF price not auto-fetching when adding/updating (fixed - tRPC client now working)
- [x] Update Prices button not working (fixed - tRPC mutation working)


## Buy Button Feature
- [x] Add Buy button next to each ETF holding
- [x] Create purchase dialog for adding more shares
- [x] Implement average cost calculation based on all purchases
- [x] Add average cost column to holdings table
- [x] Update holding when buying more shares


## Average Cost Display Bug
- [x] Fix average cost not displaying in holdings table (fixed - added purchase record creation on addHolding and average cost calculation in getPortfolioSummary)
