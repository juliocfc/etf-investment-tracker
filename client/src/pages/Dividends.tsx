import IncomeTab from "./IncomeTab";

export default function Dividends(props: { selectedPortfolioId: number, selectedAccountType?: string }) {
  return <IncomeTab selectedPortfolioId={props.selectedPortfolioId} selectedAccountType={props.selectedAccountType} />;
}
