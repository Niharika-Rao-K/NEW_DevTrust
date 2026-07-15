import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./styles/index.css";
import { BrowserRouter } from "react-router";
import { Web3Provider } from "./web3/Web3Provider.tsx";
import { GitHubAuthProvider } from "./web3/GitHubAuth.tsx";
import { UserRolesProvider } from "./web3/UserRolesContext.tsx";

createRoot(document.getElementById("root")!).render(
  <GitHubAuthProvider>
    <BrowserRouter>
    <Web3Provider>
      <UserRolesProvider>
        <App />
      </UserRolesProvider>
    </Web3Provider>
    </BrowserRouter>
  </GitHubAuthProvider>
);