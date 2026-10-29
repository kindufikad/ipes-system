import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import PhoneInput from 'react-phone-input-2';
import 'react-phone-input-2/lib/style.css';
import { useAuth } from '../context/useAuth';
import { adminApi } from '../services/api';
import BackButton from '../components/BackButton';

const ADMIN_EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@(gmail\.com|mkau\.edu\.et)$/;

const toPhoneInputValue = (value) => {
  let digits = String(value || '').replace(/\D/g, '');
  if (/^0[79]\d{8}$/.test(digits)) digits = `251${digits.slice(1)}`;
  else if (/^[79]\d{8}$/.test(digits)) digits = `251${digits}`;
  return digits;
};

const getPhoneValidationError = (value, dialCode = '251') => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits || digits === dialCode) return '';

  if (dialCode === '251' || digits.startsWith('251')) {
    const nationalNumber = digits.startsWith('251') ? digits.slice(3) : digits;
    return /^[79]\d{8}$/.test(nationalNumber)
      ? ''
      : 'Ethiopian numbers must have 9 digits after +251 and start with 7 or 9. / ከ +251 በኋላ 9 አሃዞች መሆን አለባቸው።';
  }

  return /^[1-9]\d{6,14}$/.test(digits)
    ? ''
    : 'Enter a valid international phone number. / ትክክለኛ የአለም አቀፍ ስልክ ቁጥር ያስገቡ።';
};

const toInternationalPhone = (value, dialCode = '251') => {
  let digits = String(value || '').replace(/\D/g, '');
  if (!digits || digits === dialCode) return '';
  if (/^0[79]\d{8}$/.test(digits)) digits = `251${digits.slice(1)}`;
  else if (dialCode === '251' && /^[79]\d{8}$/.test(digits)) digits = `251${digits}`;
  return `+${digits}`;
};

const roleLabels = {
  admin: 'System Administrator',
  systemadmin: 'System Administrator',
  system_admin: 'System Administrator',
  dept_head: 'Department Head',
  depthead: 'Department Head',
  college_dean: 'College Dean',
  dean: 'College Dean',
  academic_directorate: 'Academic Directorate',
  academic_director: 'Academic Directorate',
  directorate: 'Academic Directorate',
  instructor: 'Instructor',
  student: 'Student',
};

const ProfilePage = () => {
  const { user, role, updateUser, setAuthSession } = useAuth();
  const fileInputRef = useRef(null);
  const storedUser = useMemo(() => {
    if (typeof window === 'undefined') return {};
    try {
      return JSON.parse(window.localStorage.getItem('user') || '{}');
    } catch {
      return {};
    }
  }, []);
  const profile = { ...storedUser, ...user };
  const normalizedRole = String(profile.role || role || '').trim().toLowerCase();
  const isSystemAdmin = ['admin', 'systemadmin', 'system_admin'].includes(normalizedRole);
  const displayName = profile.name || profile.full_name || profile.fullName || profile.username || 'User';
  const email = profile.email || profile.username || 'Not available';
  const department = profile.department_name || profile.departmentName || profile.department || 'Not assigned';
  const [phone, setPhone] = useState(() => toPhoneInputValue(profile.phone || profile.phone_number || ''));
  const [phoneDialCode, setPhoneDialCode] = useState('251');
  const [phoneError, setPhoneError] = useState(() => getPhoneValidationError(toPhoneInputValue(profile.phone || profile.phone_number || ''), '251'));
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(profile.profile_picture || '');
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [adminDetails, setAdminDetails] = useState({
    email: profile.email || '',
    firstName: profile.first_name || '',
    lastName: profile.last_name || '',
  });
  const [emailVerificationCode, setEmailVerificationCode] = useState('');
  const [verificationPendingEmail, setVerificationPendingEmail] = useState('');
  const [passwordDetails, setPasswordDetails] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [savingPassword, setSavingPassword] = useState(false);
  const normalizedAdminEmail = String(adminDetails.email || '').trim().toLowerCase();
  const currentAdminEmail = String(profile.email || '').trim().toLowerCase();
  const adminEmailChanged = normalizedAdminEmail !== currentAdminEmail;
  const adminEmailIsValid = ADMIN_EMAIL_REGEX.test(normalizedAdminEmail);
  const adminEmailError = !adminEmailIsValid
    ? 'Please enter a valid, complete Gmail address.'
    : '';

  useEffect(() => {
    if (!photoFile) return undefined;
    const previewUrl = URL.createObjectURL(photoFile);
    setPhotoPreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [photoFile]);

  const handleImageChange = async (event) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    const previewUrl = URL.createObjectURL(selectedFile);
    setPhotoPreview(previewUrl);
    setPhotoFile(selectedFile);
    setUploadingPhoto(true);

    const formData = new FormData();
    formData.append('photo', selectedFile);

    try {
      const response = await axios.post('/api/profile', formData, {
        withCredentials: true,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const nextPhoto = response.data?.user?.profile_picture || response.data?.profile_picture || response.data?.user?.profile_photo || response.data?.profile_photo || previewUrl;
      const updatedUser = { ...profile, profile_picture: nextPhoto, profile_photo: nextPhoto, avatar: nextPhoto };
      updateUser(updatedUser);
      setPhotoPreview(nextPhoto);
      setPhotoFile(null);
      toast.success('Profile photo updated successfully!');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to update your profile photo.');
    } finally {
      setUploadingPhoto(false);
      event.target.value = '';
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSystemAdmin) {
      if (!adminEmailIsValid) {
        toast.error('Please enter a valid, complete Gmail address.');
        return;
      }
      if (adminEmailChanged && verificationPendingEmail !== normalizedAdminEmail) {
        toast.error('Send a verification code to your new email address before saving.');
        return;
      }
      if (adminEmailChanged && !/^\d{6}$/.test(emailVerificationCode)) {
        toast.error('Enter the 6-digit verification code sent to your new email address.');
        return;
      }
      setSaving(true);
      try {
        const result = await adminApi.updateProfile({
          ...adminDetails,
          email: normalizedAdminEmail,
          ...(adminEmailChanged ? { verificationCode: emailVerificationCode } : {}),
        });
        const updatedUser = {
          ...profile,
          ...(result?.user || {}),
          email: result?.user?.email || adminDetails.email.trim().toLowerCase(),
          first_name: result?.user?.first_name || adminDetails.firstName.trim(),
          last_name: result?.user?.last_name || adminDetails.lastName.trim(),
          name: result?.user?.name || `${adminDetails.firstName.trim()} ${adminDetails.lastName.trim()}`.trim(),
        };
        if (result?.token) setAuthSession(result.token, updatedUser);
        else updateUser(updatedUser);
        setAdminDetails({ email: updatedUser.email, firstName: updatedUser.first_name, lastName: updatedUser.last_name });
        setEmailVerificationCode('');
        setVerificationPendingEmail('');
        toast.success('Profile updated successfully.');
      } catch (error) {
        toast.error(error.response?.data?.message || error.message || 'Unable to update your profile.');
      } finally {
        setSaving(false);
      }
      return;
    }

    const nextPhoneError = getPhoneValidationError(phone, phoneDialCode);
    if (nextPhoneError) {
      setPhoneError(nextPhoneError);
      toast.error(nextPhoneError);
      return;
    }
    const internationalPhone = toInternationalPhone(phone, phoneDialCode);
    const formData = new FormData();
    formData.append('phone', internationalPhone);
    if (photoFile) formData.append('photo', photoFile);

    setSaving(true);
    try {
      const response = await axios.put('/api/user/profile', formData, { withCredentials: true });
      const savedPhone = response.data?.user?.phone_number ?? internationalPhone;
      const updatedUser = { ...profile, phone: savedPhone, phone_number: savedPhone, profile_picture: response.data?.user?.profile_picture || photoPreview };
      updateUser(updatedUser);
      setPhone(toPhoneInputValue(savedPhone));
      setPhotoPreview(updatedUser.profile_picture);
      setPhotoFile(null);
      toast.success('Profile updated successfully!');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to update your profile.');
    } finally {
      setSaving(false);
    }
  };

  const requestAdminEmailVerification = async () => {
    if (!adminEmailIsValid) return;
    setSaving(true);
    try {
      await adminApi.sendProfileEmailVerification(normalizedAdminEmail);
      setVerificationPendingEmail(normalizedAdminEmail);
      setEmailVerificationCode('');
      toast.success('A 6-digit verification code has been sent to your new email address.');
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || 'Unable to send the verification code.');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    const { currentPassword, newPassword, confirmPassword } = passwordDetails;
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error('Please complete all password fields.');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New password and confirmation do not match.');
      return;
    }

    setSavingPassword(true);
    try {
      const result = await adminApi.changePassword({ currentPassword, newPassword, confirmPassword });
      if (result?.token && result?.user) setAuthSession(result.token, { ...profile, ...result.user });
      setPasswordDetails({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast.success('Password updated successfully.');
    } catch (error) {
      toast.error(error.message || 'Unable to update your password.');
    } finally {
      setSavingPassword(false);
    }
  };

  const avatarSource = photoPreview || profile.profile_picture || profile.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=dbeafe&color=1e3a8a`;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-24 text-slate-900 sm:px-6">
      <form onSubmit={handleSubmit} noValidate={isSystemAdmin} className="mx-auto mt-8 max-w-2xl rounded-3xl border border-gray-100 bg-white p-8 shadow-sm" aria-labelledby="profile-title">
        <BackButton />
        <div className="border-b border-slate-100 pb-6">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">Account</p>
          <h1 id="profile-title" className="mt-2 text-3xl font-bold">Profile</h1>
          <p className="mt-2 text-slate-600">Your authenticated IPES account details.</p>
        </div>
        <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:items-end">
          <img src={avatarSource} alt={`${displayName} profile`} className="h-24 w-24 rounded-full border-4 border-blue-50 object-cover" />
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadingPhoto} className="inline-flex rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-900 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60">
            {uploadingPhoto ? 'Uploading...' : 'Change Profile Photo'}
          </button>
        </div>

        <div className="mt-8 space-y-5">
          {isSystemAdmin ? <>
            <label className="block text-sm font-medium text-slate-700">First Name<input value={adminDetails.firstName} onChange={(event) => setAdminDetails((current) => ({ ...current, firstName: event.target.value }))} autoComplete="given-name" required maxLength={128} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" /></label>
            <label className="block text-sm font-medium text-slate-700">Last Name<input value={adminDetails.lastName} onChange={(event) => setAdminDetails((current) => ({ ...current, lastName: event.target.value }))} autoComplete="family-name" required maxLength={128} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" /></label>
            <label className="block text-sm font-medium text-slate-700">Email Address<input type="email" value={adminDetails.email} onChange={(event) => {
              const nextEmail = event.target.value;
              setAdminDetails((current) => ({ ...current, email: nextEmail }));
              if (nextEmail.trim().toLowerCase() !== verificationPendingEmail) {
                setVerificationPendingEmail('');
                setEmailVerificationCode('');
              }
            }} autoComplete="email" required maxLength={255} aria-invalid={Boolean(adminEmailError)} aria-describedby={adminEmailError ? 'admin-email-error' : undefined} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />{adminEmailError && <span id="admin-email-error" className="mt-1 block text-xs text-red-600" role="alert">{adminEmailError}</span>}</label>
            {adminEmailChanged && <div className="space-y-3 rounded-xl border border-slate-200 p-4">
              <button type="button" onClick={requestAdminEmailVerification} disabled={saving || !adminEmailIsValid} className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50">
                {verificationPendingEmail === normalizedAdminEmail ? 'Resend verification code' : 'Send verification code'}
              </button>
              {verificationPendingEmail === normalizedAdminEmail && <label className="block text-sm font-medium text-slate-700">6-digit verification code<input value={emailVerificationCode} onChange={(event) => setEmailVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} aria-label="6-digit email verification code" className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" /></label>}
            </div>}
          </> : <>
            <label className="block text-sm font-medium text-slate-700">Full Name<input value={displayName} disabled className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-slate-500" /></label>
            <label className="block text-sm font-medium text-slate-700">Email Address<input value={email} disabled className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-slate-500" /></label>
          </>}
          <label className="block text-sm font-medium text-slate-700">Role / Title<input value={roleLabels[normalizedRole] || normalizedRole || 'User'} disabled className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-slate-500" /></label>
          <label className="block text-sm font-medium text-slate-700">Department<input value={department} disabled className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-slate-500" /></label>
          {!isSystemAdmin && <div>
            <label htmlFor="profile-phone" className="block text-sm font-medium text-slate-700">Phone Number / የስልክ ቁጥር</label>
            <PhoneInput
              country="et"
              preferredCountries={['et']}
              enableSearch
              countryCodeEditable={false}
              value={phone}
              onChange={(value, country) => {
                const dialCode = country?.dialCode || '251';
                setPhone(value);
                setPhoneDialCode(dialCode);
                setPhoneError(getPhoneValidationError(value, dialCode));
              }}
              inputProps={{
                id: 'profile-phone',
                name: 'phone',
                autoComplete: 'tel',
                'aria-invalid': Boolean(phoneError),
                'aria-describedby': phoneError ? 'profile-phone-error' : undefined,
              }}
              containerClass="mt-2 w-full"
              inputStyle={{
                width: '100%',
                height: '48px',
                borderRadius: '0.75rem',
                borderColor: phoneError ? '#ef4444' : '#cbd5e1',
                backgroundColor: '#fff',
                color: '#0f172a',
                fontSize: '1rem',
              }}
              buttonStyle={{
                borderTopLeftRadius: '0.75rem',
                borderBottomLeftRadius: '0.75rem',
                borderColor: phoneError ? '#ef4444' : '#cbd5e1',
                backgroundColor: '#fff',
              }}
            />
            {phoneError ? <p id="profile-phone-error" className="mt-1 text-xs text-red-600" role="alert">{phoneError}</p> : null}
          </div>}
        </div>
        <button type="submit" disabled={saving || Boolean(phoneError) || (isSystemAdmin && (!adminEmailIsValid || (adminEmailChanged && (verificationPendingEmail !== normalizedAdminEmail || !/^\d{6}$/.test(emailVerificationCode)))))} className="mt-8 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300">{saving ? 'Saving...' : 'Save Profile Changes'}</button>
      </form>
      {isSystemAdmin && <form onSubmit={handlePasswordSubmit} className="mx-auto mt-6 max-w-2xl rounded-3xl border border-gray-100 bg-white p-8 shadow-sm" aria-labelledby="password-title">
        <h2 id="password-title" className="text-xl font-semibold text-slate-900">Change Password</h2>
        <div className="mt-5 space-y-4">
          <label className="block text-sm font-medium text-slate-700">Current Password<input type="password" autoComplete="current-password" required value={passwordDetails.currentPassword} onChange={(event) => setPasswordDetails((current) => ({ ...current, currentPassword: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" /></label>
          <label className="block text-sm font-medium text-slate-700">New Password<input type="password" autoComplete="new-password" minLength={8} required value={passwordDetails.newPassword} onChange={(event) => setPasswordDetails((current) => ({ ...current, newPassword: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" /></label>
          <label className="block text-sm font-medium text-slate-700">Confirm Password<input type="password" autoComplete="new-password" minLength={8} required value={passwordDetails.confirmPassword} onChange={(event) => setPasswordDetails((current) => ({ ...current, confirmPassword: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" /></label>
        </div>
        <button type="submit" disabled={savingPassword} className="mt-6 rounded-xl bg-slate-800 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60">{savingPassword ? 'Updating...' : 'Update Password'}</button>
      </form>}
    </main>
  );
};

export default ProfilePage;