import Navbar from "../components/Navbar.jsx";
import Workspace from "../components/Workspace.jsx";
import "./page.css";

export default function Page() {
  return (
    <div className="app-layout">
      <Navbar />
      <main className="app-layout__content container">
        <Workspace />
      </main>
    </div>
  );
}
