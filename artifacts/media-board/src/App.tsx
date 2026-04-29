import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useState } from "react";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Schedule from "@/pages/Schedule";
import { Layout } from "@/components/Layout";
import { EventDialog } from "@/components/EventDialog";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    }
  }
});

function AppContent() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  return (
    <Layout onAddClick={() => setIsAddDialogOpen(true)}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/schedule" component={Schedule} />
        <Route component={NotFound} />
      </Switch>
      <EventDialog 
        open={isAddDialogOpen} 
        onOpenChange={setIsAddDialogOpen} 
        mode="create" 
      />
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AppContent />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;