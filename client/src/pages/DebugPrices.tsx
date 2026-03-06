import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function DebugPrices() {
  const updatePricesMutation = trpc.etf.updatePrices.useMutation({
    onSuccess: (data) => {
      console.log("Prices updated successfully:", data);
      toast.success("Prices updated!");
    },
    onError: (error) => {
      console.error("Error updating prices:", error);
      toast.error(`Error: ${error.message}`);
    },
  });

  return (
    <div className="p-4 bg-red-900 text-white space-y-4">
      <h2>Debug: Update Prices</h2>
      <p>Mutation object exists: {updatePricesMutation ? "yes" : "no"}</p>
      <p>isPending: {updatePricesMutation.isPending ? "true" : "false"}</p>
      <p>isError: {updatePricesMutation.isError ? "true" : "false"}</p>
      <p>isSuccess: {updatePricesMutation.isSuccess ? "true" : "false"}</p>
      <Button
        onClick={() => {
          console.log("Button clicked - calling updatePricesMutation.mutate()");
          console.log("Mutation object:", updatePricesMutation);
          updatePricesMutation.mutate({ portfolioId: 1 });
        }}
        disabled={updatePricesMutation.isPending}
      >
        {updatePricesMutation.isPending ? "Updating..." : "Test Update Prices"}
      </Button>
      <Button
        onClick={() => {
          console.log("Direct test button clicked");
          alert("Button is clickable!");
        }}
      >
        Test Click
      </Button>
    </div>
  );
}
