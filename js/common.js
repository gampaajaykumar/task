
async function logoutUser() {
    try {
        const response = await fetch('/logout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': localStorage.getItem('user_id')
            }
        });

        if (!response.ok) {
            throw new Error('Logout failed');
        }

       
        localStorage.removeItem('user_id');

        
        window.location.href = '/index.html';
    } catch (error) {
        console.error('Logout error:', error);
        alert('Failed to logout. Please try again.');
    }
}


window.logoutUser = logoutUser;
