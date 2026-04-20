import { Link } from "react-router-dom";

export default function Unauthorized() {
  return (
    <div className="center-screen">
      <div className="card simple-card">
        <h2>Access Denied</h2>
        <p>You don’t have access to this product.</p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 16 }}>
          <Link to="/login" className="btn btn-primary">
            Go to Login
          </Link>
        </div>
      </div>
    </div>
  );
}

