import { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import NavBar from "../components/NavBar";

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);

  // Data states
  const [users, setUsers] = useState([]);
  const [allLogs, setAllLogs] = useState([]);
  const [allVoices, setAllVoices] = useState([]);
  const [activeTab, setActiveTab] = useState("users"); // 'users' | 'logs'
  const [loadingData, setLoadingData] = useState(true);

  // Create user form state
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("user");
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  // Change password modal state
  const [editingUserId, setEditingUserId] = useState(null);
  const [editingUsername, setEditingUsername] = useState("");
  const [updatedPassword, setUpdatedPassword] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");

  // Search/filter state for logs
  const [logSearch, setLogSearch] = useState("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => {
        if (!res.ok) throw new Error("Unauthenticated");
        return res.json();
      })
      .then((data) => {
        if (data.user?.role !== "admin") {
          router.replace("/");
        } else {
          setCurrentUser(data.user);
          setLoadingUser(false);
          loadAdminData();
        }
      })
      .catch(() => {
        router.replace("/login?redirect=/admin");
      });
  }, [router]);

  async function loadAdminData() {
    setLoadingData(true);
    try {
      const [usersRes, logsRes] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/logs?limit=250"),
      ]);

      if (usersRes.ok) {
        const uData = await usersRes.json();
        setUsers(uData.users || []);
      }
      if (logsRes.ok) {
        const lData = await logsRes.json();
        setAllLogs(lData.logs || []);
        setAllVoices(lData.voices || []);
      }
    } catch (err) {
      console.error("Error loading admin data:", err);
    } finally {
      setLoadingData(false);
    }
  }

  async function handleCreateUser(e) {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");

    if (!newUsername.trim() || !newPassword) {
      setFormError("Username and password are required.");
      return;
    }

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newPassword,
          role: newRole,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create user.");

      setFormSuccess(
        `User account "${data.user.username}" created successfully!`,
      );
      setNewUsername("");
      setNewPassword("");
      setNewRole("user");
      setShowAddUser(false);
      loadAdminData();
    } catch (err) {
      setFormError(err.message || "Failed to create user.");
    }
  }

  async function handleDeleteUser(user) {
    if (user.id === currentUser?.id) {
      alert("You cannot delete your own active administrator account.");
      return;
    }

    if (
      !confirm(
        `Are you sure you want to delete user "${user.username}"? They will lose access immediately.`,
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/users?id=${user.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete user.");
      loadAdminData();
    } catch (err) {
      alert(err.message || "Could not delete user.");
    }
  }

  async function handleUpdatePassword(e) {
    e.preventDefault();
    setPwError("");
    setPwSuccess("");

    if (!updatedPassword || updatedPassword.length < 4) {
      setPwError("Password must be at least 4 characters.");
      return;
    }

    try {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingUserId,
          password: updatedPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update password.");

      setPwSuccess("Password updated successfully!");
      setTimeout(() => {
        setEditingUserId(null);
        setUpdatedPassword("");
        setPwSuccess("");
      }, 1200);
    } catch (err) {
      setPwError(err.message || "Could not update password.");
    }
  }

  const filteredLogs = allLogs.filter((log) => {
    if (!logSearch.trim()) return true;
    const term = logSearch.toLowerCase();
    return (
      (log.username && log.username.toLowerCase().includes(term)) ||
      (log.event && log.event.toLowerCase().includes(term)) ||
      (log.message && log.message.toLowerCase().includes(term)) ||
      (log.voiceId && log.voiceId.toLowerCase().includes(term))
    );
  });

  if (loadingUser) {
    return (
      <div className="loading-screen">
        <p>Loading Admin Dashboard…</p>
        <style jsx>{`
          .loading-screen {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--bg);
            color: var(--text-muted);
          }
        `}</style>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Admin Portal - Voice Studio</title>
      </Head>

      <NavBar user={currentUser} />

      <main className="admin-page">
        <div className="admin-container">
          <header className="page-header">
            <div>
              <p className="eyebrow">Platform Administration</p>
              <h1>Admin Portal & Gateway</h1>
              <p className="sub">
                Manage assigned credentials for voice users and inspect global
                voice clone activity logs.
              </p>
            </div>

            <button
              type="button"
              onClick={loadAdminData}
              className="refresh-data-btn"
            >
              🔄 Refresh Data
            </button>
          </header>

          {/* Stats Summary Bar */}
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-num">{users.length}</span>
              <span className="stat-label">Total Users</span>
            </div>
            <div className="stat-card">
              <span className="stat-num">{allVoices.length}</span>
              <span className="stat-label">Total Cloned Voices</span>
            </div>
            <div className="stat-card">
              <span className="stat-num">
                {allVoices.filter((v) => v.status === "training").length}
              </span>
              <span className="stat-label">Active Training</span>
            </div>
            <div className="stat-card">
              <span className="stat-num">{allLogs.length}</span>
              <span className="stat-label">Logged Events</span>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="tabs">
            <button
              className={`tab-btn ${activeTab === "users" ? "active" : ""}`}
              onClick={() => setActiveTab("users")}
            >
              👥 User Management ({users.length})
            </button>
            <button
              className={`tab-btn ${activeTab === "logs" ? "active" : ""}`}
              onClick={() => setActiveTab("logs")}
            >
              📜 Global Activity Logs ({allLogs.length})
            </button>
          </div>

          {/* Tab 1: User Management */}
          {activeTab === "users" && (
            <section className="tab-content">
              <div className="section-toolbar">
                <div>
                  <h2>User Accounts</h2>
                  <p className="toolbar-sub">
                    Assign fixed usernames and passwords for your team and users
                    to access the studio.
                  </p>
                </div>
                <button
                  type="button"
                  className="add-user-btn"
                  onClick={() => setShowAddUser(!showAddUser)}
                >
                  {showAddUser ? "✕ Cancel" : "+ Add New User"}
                </button>
              </div>

              {formSuccess && (
                <div className="success-banner">{formSuccess}</div>
              )}

              {/* Add User Drawer / Card */}
              {showAddUser && (
                <div className="add-user-card">
                  <h3>Assign New User Account</h3>
                  <form onSubmit={handleCreateUser} className="add-user-form">
                    {formError && (
                      <div className="error-alert">{formError}</div>
                    )}

                    <div className="form-row">
                      <label className="field">
                        <span>Username</span>
                        <input
                          type="text"
                          value={newUsername}
                          onChange={(e) => setNewUsername(e.target.value)}
                          placeholder="e.g. voiceuser1"
                          required
                        />
                      </label>

                      <label className="field">
                        <span>Fixed Password</span>
                        <input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Minimum 4 characters"
                          required
                        />
                      </label>

                      <label className="field">
                        <span>Role</span>
                        <select
                          value={newRole}
                          onChange={(e) => setNewRole(e.target.value)}
                        >
                          <option value="user">User (Voice Studio only)</option>
                          <option value="admin">
                            Administrator (Full Access)
                          </option>
                        </select>
                      </label>
                    </div>

                    <button type="submit" className="save-btn">
                      Create & Assign Account
                    </button>
                  </form>
                </div>
              )}

              {/* Users Table */}
              <div className="table-wrapper">
                <table className="users-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Role</th>
                      <th>Voices Cloned</th>
                      <th>Created Date</th>
                      <th className="th-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id}>
                        <td>
                          <div className="user-cell">
                            <span className="user-avatar-sm">
                              {user.username.charAt(0).toUpperCase()}
                            </span>
                            <span className="user-cell-name">
                              {user.username}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span
                            className={`role-badge ${
                              user.role === "admin"
                                ? "admin-badge"
                                : "user-badge-tag"
                            }`}
                          >
                            {user.role}
                          </span>
                        </td>
                        <td>{user.voicesCount || 0} voices</td>
                        <td className="date-cell">
                          {formatDate(user.createdAt)}
                        </td>
                        <td className="actions-cell">
                          <button
                            type="button"
                            className="table-action-btn"
                            onClick={() => {
                              setEditingUserId(user.id);
                              setEditingUsername(user.username);
                              setUpdatedPassword("");
                              setPwError("");
                              setPwSuccess("");
                            }}
                          >
                            Reset Password
                          </button>
                          <button
                            type="button"
                            className="table-action-btn delete-action"
                            onClick={() => handleDeleteUser(user)}
                            disabled={user.id === currentUser?.id}
                            title={
                              user.id === currentUser?.id
                                ? "Cannot delete your active account"
                                : "Delete user"
                            }
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Tab 2: Global Platform Logs */}
          {activeTab === "logs" && (
            <section className="tab-content">
              <div className="section-toolbar">
                <div>
                  <h2>Global Platform Entry Logs</h2>
                  <p className="toolbar-sub">
                    Live system and voice cloning events across all user
                    sessions.
                  </p>
                </div>
                <div className="search-box">
                  <input
                    type="text"
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    placeholder="Filter by user, event, voice ID…"
                  />
                </div>
              </div>

              <div className="logs-list">
                {filteredLogs.length === 0 ? (
                  <div className="empty-logs">
                    No logs found matching filter.
                  </div>
                ) : (
                  filteredLogs.map((log) => (
                    <div key={log.id} className="log-row">
                      <div className="log-left">
                        <span className="log-user-tag">@{log.username}</span>
                        <span className="log-event-tag">
                          {log.event.replace(/_/g, " ")}
                        </span>
                        {log.voiceId && (
                          <code className="log-voice-code" title="Voice ID">
                            {log.voiceId}
                          </code>
                        )}
                      </div>
                      <div className="log-msg">{log.message}</div>
                      <div className="log-time">
                        {formatDate(log.timestamp)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}

          {/* Reset Password Modal */}
          {editingUserId && (
            <div className="modal-backdrop">
              <div className="modal-card">
                <h3>Reset Password for "{editingUsername}"</h3>
                <p className="modal-sub">
                  Enter a new fixed password for this account.
                </p>

                {pwError && <div className="error-alert">{pwError}</div>}
                {pwSuccess && <div className="success-banner">{pwSuccess}</div>}

                <form onSubmit={handleUpdatePassword}>
                  <label className="field">
                    <span>New Password</span>
                    <input
                      type="password"
                      value={updatedPassword}
                      onChange={(e) => setUpdatedPassword(e.target.value)}
                      placeholder="Minimum 4 characters"
                      required
                      autoFocus
                    />
                  </label>

                  <div className="modal-actions">
                    <button
                      type="button"
                      className="cancel-btn"
                      onClick={() => setEditingUserId(null)}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="save-btn">
                      Update Password
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </main>

      <style jsx>{`
        .admin-page {
          min-height: calc(100vh - 64px);
          padding: 40px 24px 80px;
          background: var(--bg);
        }

        .admin-container {
          max-width: 1120px;
          margin: 0 auto;
        }

        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 32px;
          gap: 20px;
          flex-wrap: wrap;
        }

        .eyebrow {
          color: var(--accent);
          font-size: 0.88rem;
          margin: 0 0 8px;
          font-weight: 500;
        }

        h1 {
          font-family: var(--font-display);
          font-size: 2.2rem;
          font-weight: 500;
          color: var(--text);
          margin: 0 0 10px;
        }

        .sub {
          color: var(--text-muted);
          font-size: 0.95rem;
          margin: 0;
          max-width: 60ch;
          line-height: 1.5;
        }

        .refresh-data-btn {
          background: var(--surface-alt);
          border: 1px solid var(--border);
          color: var(--text);
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 0.88rem;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .refresh-data-btn:hover {
          background: var(--border);
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 16px;
          margin-bottom: 36px;
        }

        .stat-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .stat-num {
          font-family: var(--font-display);
          font-size: 1.8rem;
          font-weight: 600;
          color: var(--accent);
        }

        .stat-label {
          color: var(--text-muted);
          font-size: 0.85rem;
        }

        .tabs {
          display: flex;
          gap: 12px;
          margin-bottom: 24px;
          border-bottom: 1px solid var(--border);
          padding-bottom: 12px;
        }

        .tab-btn {
          background: transparent;
          border: none;
          color: var(--text-muted);
          font-size: 0.95rem;
          padding: 8px 16px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .tab-btn:hover {
          color: var(--text);
          background: var(--surface-alt);
        }

        .tab-btn.active {
          color: #14110f;
          background: var(--accent);
          font-weight: 600;
        }

        .tab-content {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 28px;
        }

        .section-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
          gap: 16px;
          flex-wrap: wrap;
        }

        h2 {
          font-family: var(--font-display);
          font-size: 1.35rem;
          font-weight: 500;
          margin: 0 0 4px;
        }

        .toolbar-sub {
          color: var(--text-muted);
          font-size: 0.85rem;
          margin: 0;
        }

        .add-user-btn {
          background: var(--accent);
          color: #14110f;
          border: none;
          padding: 9px 18px;
          border-radius: 8px;
          font-size: 0.88rem;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.2s ease;
        }

        .add-user-btn:hover {
          opacity: 0.9;
        }

        .search-box input {
          background: var(--surface-alt);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 8px 14px;
          color: var(--text);
          font-size: 0.88rem;
          width: 280px;
        }

        .add-user-card {
          background: var(--surface-alt);
          border: 1px solid rgba(232, 163, 61, 0.3);
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 24px;
        }

        .add-user-card h3 {
          font-size: 1.1rem;
          margin: 0 0 16px;
        }

        .form-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
          margin-bottom: 16px;
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 0.85rem;
          color: var(--text-muted);
        }

        .field input,
        .field select {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 10px 12px;
          color: var(--text);
          font-size: 0.92rem;
          font-family: inherit;
        }

        .save-btn {
          background: var(--accent);
          color: #14110f;
          border: none;
          padding: 10px 20px;
          border-radius: 8px;
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
        }

        .success-banner {
          background: rgba(111, 168, 138, 0.15);
          border: 1px solid rgba(111, 168, 138, 0.3);
          color: #8ed3ad;
          padding: 10px 16px;
          border-radius: 8px;
          font-size: 0.88rem;
          margin-bottom: 18px;
        }

        .error-alert {
          background: rgba(217, 105, 79, 0.15);
          border: 1px solid rgba(217, 105, 79, 0.3);
          color: #f79d86;
          padding: 10px 16px;
          border-radius: 8px;
          font-size: 0.88rem;
          margin-bottom: 18px;
        }

        .table-wrapper {
          overflow-x: auto;
        }

        .users-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }

        .users-table th {
          padding: 12px 16px;
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
          border-bottom: 1px solid var(--border);
        }

        .users-table td {
          padding: 14px 16px;
          font-size: 0.9rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .th-right,
        .actions-cell {
          text-align: right;
        }

        .user-cell {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .user-avatar-sm {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: var(--accent);
          color: #14110f;
          font-weight: bold;
          font-size: 0.8rem;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .user-cell-name {
          font-weight: 500;
          color: var(--text);
        }

        .role-badge {
          font-size: 0.72rem;
          padding: 3px 8px;
          border-radius: 4px;
          font-weight: 600;
          text-transform: uppercase;
        }

        .admin-badge {
          background: rgba(232, 163, 61, 0.2);
          color: var(--accent);
          border: 1px solid rgba(232, 163, 61, 0.3);
        }

        .user-badge-tag {
          background: rgba(245, 239, 230, 0.08);
          color: var(--text-muted);
        }

        .date-cell {
          font-size: 0.82rem;
          color: var(--text-muted);
        }

        .table-action-btn {
          background: var(--surface-alt);
          border: 1px solid var(--border);
          color: var(--text);
          padding: 5px 10px;
          border-radius: 6px;
          font-size: 0.78rem;
          cursor: pointer;
          margin-left: 6px;
          transition: all 0.2s ease;
        }

        .table-action-btn:hover {
          background: var(--border);
        }

        .delete-action {
          color: var(--danger);
          border-color: rgba(217, 105, 79, 0.3);
        }

        .delete-action:hover:not(:disabled) {
          background: rgba(217, 105, 79, 0.15);
        }

        .delete-action:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .logs-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .log-row {
          background: var(--surface-alt);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 12px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }

        .log-left {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .log-user-tag {
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--accent);
        }

        .log-event-tag {
          font-size: 0.72rem;
          padding: 2px 6px;
          border-radius: 4px;
          background: rgba(245, 239, 230, 0.08);
          color: var(--text);
          text-transform: capitalize;
        }

        .log-voice-code {
          font-size: 0.75rem;
          background: rgba(0, 0, 0, 0.4);
          padding: 2px 6px;
          border-radius: 4px;
          color: var(--text-muted);
        }

        .log-msg {
          flex: 1;
          font-size: 0.85rem;
          color: var(--text);
          min-width: 240px;
        }

        .log-time {
          font-size: 0.75rem;
          color: #7b7165;
          white-space: nowrap;
        }

        .empty-logs {
          text-align: center;
          padding: 30px;
          color: var(--text-muted);
        }

        .modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          z-index: 200;
        }

        .modal-card {
          width: 100%;
          max-width: 420px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 28px;
        }

        .modal-card h3 {
          margin: 0 0 6px;
          font-size: 1.2rem;
        }

        .modal-sub {
          color: var(--text-muted);
          font-size: 0.85rem;
          margin: 0 0 18px;
        }

        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 20px;
        }

        .cancel-btn {
          background: transparent;
          border: 1px solid var(--border);
          color: var(--text-muted);
          padding: 9px 16px;
          border-radius: 8px;
          cursor: pointer;
        }
      `}</style>
    </>
  );
}
