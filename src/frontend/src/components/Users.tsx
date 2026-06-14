import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';
import { API } from '../constants';
import { useConfirm } from './ConfirmDialog';
import { useModal } from './Modal';
import UserModal from './UserModal';
import type { NutUser } from '../types';

export default function Users() {
  const [userList, setUserList] = useState<NutUser[]>([]);
  const { dangerConfirm, alert } = useConfirm();
  const { openModal, closeModal } = useModal();
  const deletePending = useRef<Record<string, boolean>>({});

  const loadUsers = useCallback(async () => {
    try {
      setUserList(await api<NutUser[]>(API.USERS));
    } catch {
      setUserList([]);
    }
  }, []);

  useEffect(() => { void loadUsers(); }, [loadUsers]);

  function handleEdit(user: NutUser) {
    openModal(<UserModal mode="edit" user={user} onSaved={() => { closeModal(); void loadUsers(); }} />);
  }

  function handleAdd() {
    openModal(<UserModal mode="add" onSaved={() => { closeModal(); void loadUsers(); }} />);
  }

  async function handleDelete(name: string) {
    const key = 'user:' + name;
    if (deletePending.current[key]) return;
    deletePending.current[key] = true;
    try {
      const ok = await dangerConfirm('Delete user "' + name + '"?');
      if (!ok) return;
      await api(API.user(name), { method: 'DELETE' });
      void loadUsers();
    } catch (e) {
      await alert('Failed to delete user:\n' + (e as Error).message, 'Error');
    } finally {
      delete deletePending.current[key];
    }
  }

  return (
    <>
      <h2>Users</h2>
      <div className="toolbar">
        <button className="primary" onClick={handleAdd}>Add User</button>
        <button className="secondary" onClick={() => void loadUsers()}>Refresh</button>
      </div>
      <div id="users-table-wrap">
        <table>
          <thead>
            <tr><th>Username</th><th>Role</th><th>Password</th><th>Actions</th><th>Instcmds</th><th></th></tr>
          </thead>
          <tbody id="users-body">
            {userList.length === 0
              ? <tr><td colSpan={6} className="empty">No users.</td></tr>
              : userList.map(u => (
                  <tr key={u.name}>
                    <td>{u.name}</td>
                    <td>{u.upsmon ?? '-'}</td>
                    <td>{u.password}</td>
                    <td>{u.actions ?? '-'}</td>
                    <td>{u.instcmds ?? '-'}</td>
                    <td>
                      <button className="secondary" onClick={() => handleEdit(u)}>Edit</button>
                      <button className="secondary danger" onClick={() => void handleDelete(u.name)}>Delete</button>
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
