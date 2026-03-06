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


## Purchase History Feature
- [x] Add deletePurchase procedure to backend
- [x] Create purchase history modal in Portfolio component
- [x] Display purchase date, quantity, and price in modal
- [x] Add delete button for each purchase with confirmation
- [x] Update average cost when purchases are deleted
- [x] Write tests for delete purchase functionality


## Allocation Percentage Column
- [x] Add allocation percentage calculation in Portfolio component
- [x] Add percentage column to holdings table
- [x] Display percentage with one decimal place


## Purchase Deletion Bug Fix
- [x] Fix: Deleting a purchase should decrement the holding quantity (FIXED - verified with vitest tests showing quantity correctly decrements and holding is deleted when quantity becomes 0)


## CSV Import Feature
- [x] Create backend procedure to parse CSV file with date, quantity, cost columns
- [x] Validate CSV data (date format, numeric values, required fields)
- [x] Create bulk import procedure to add multiple purchases at once
- [x] Build frontend CSV import modal with file upload
- [x] Add preview table showing parsed CSV data before import
- [x] Handle import errors and show user feedback
- [x] Update holding quantity and average cost after bulk import
- [x] Write vitest tests for CSV parsing and bulk import


## Gain/Loss Percentage Column & Pie Chart
- [x] Add percentage gain/loss column to holdings table
- [x] Create pie chart component showing allocation percentages
- [x] Display cash allocation in pie chart
- [x] Add percentage labels to pie chart slices


## Login Issue
- [x] Fix: Login redirects back to login page after account selection (FIXED - Root cause was SameSite=None cookie not being stored due to missing Secure flag. Fixed by: 1) Adding app.set('trust proxy', 1) to detect HTTPS correctly, 2) Forcing secure:true in production environments, 3) Improved useAuth refetch strategy)

## Google OAuth Implementation
- [x] Create Google OAuth service with token exchange and user info retrieval
- [x] Implement Google OAuth callback endpoint (/api/oauth/google/callback)
- [x] Add Google OAuth environment variables (GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET)
- [x] Update frontend login URL generator for Google OAuth
- [x] Update login page to use "Login with Google" button
- [x] Test Google OAuth credentials and service initialization
- [x] Verify session cookie creation and authentication flow

## Current Issues to Fix
- [x] Change all price/dollar values to 2 decimal places (AVG Cost, Current Price, Value)
- [x] Fix portfolio allocation percentage showing "NaN%"
- [x] Fix pie chart not visible/rendering

## Performance Metrics Feature
- [x] Fetch historical price data from Alpha Vantage API
- [x] Calculate YTD return for each holding
- [x] Calculate 1-year return for each holding
- [x] Calculate volatility (standard deviation) for each holding
- [x] Add metrics to Portfolio table UI
- [x] Test metrics calculation and display

## Bug Fixes
- [x] Fix React hooks error in performance metrics fetching (useUtils inside async)
