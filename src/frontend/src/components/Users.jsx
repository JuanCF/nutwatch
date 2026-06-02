import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';
import { API } from '../constants';
import { useConfirm } from './ConfirmDialog';
import { useModal } from './Modal';
import UserModal from './UserModal';

export default function Users() {
  const [userList, setUserList] = useState([]);
  const { dangerConfirm, alert } = useConfirm();
  const { openModal, closeModal } = useModal();
  const deletePending = useRef({});

  const loadUsers = useCallback(async () => {
    try {
      setUserList(await api(API.USERS));
    } catch (e) {
      setUserList([]);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  function handleEdit(user) {
    openModal(<UserModal mode="edit" user={user} onSaved={() => { closeModal(); loadUsers(); }} />);
  }

  function handleAdd() {
    openModal(<UserModal mode="add" onSaved={() => { closeModal(); loadUsers(); }} />);
  }

  async function handleDelete(name) {
    const key = 'user:' + name;
    if (deletePending.current[key]) return;
    deletePending.current[key] = true;
    try {
      const ok = await dangerConfirm('Delete user "' + name + '"?');
      if (!ok) return;
      await api(API.user(name), { method: 'DELETE' });
      loadUsers();
    } catch (e) {
      await alert('Failed to delete user:\n' + e.message, 'Error');
    } finally {
      delete deletePending.current[key];
    }
  }

  return (
    <>
      <h2>Users</h2>
      <div className="toolbar">
        <button className="primary" onClick={handleAdd}>Add User</button>
        <button className="secondary" onClick={loadUsers}>Refresh</button>
      </div>
      <div id="users-table-wrap">
        <table>
          <thead>
            <tr><th>Username</th><th>Role</th><th>Password</th><th>Actions</th><th>Instcmds</th><th></th></tr>
          </thead>
          <tbody id="users-body">
            {userList.length === 0
              ? <tr><td colSpan="6" className="empty">No users.</td></tr>
              : userList.map(u => (
                  <tr key={u.name}>
                    <td>{u.name}</td>
                    <td>{u.upsmon || '-'}</td>
                    <td>{u.password}</td>
                    <td>{u.actions || '-'}</td>
                    <td>{u.instcmds || '-'}</td>
                    <td>
                      <button className="secondary" onClick={() => handleEdit(u)}>Edit</button>
                      <button className="secondary danger" onClick={() => handleDelete(u.name)}>Delete</button>
                    </td>
                  </tr>
                ))
            }
          </tbody>
        </table>
      </div>
    </>
  );
}
