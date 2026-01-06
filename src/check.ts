// Run-time checking of preconditions.

function fail(message: string): never {
    throw new Error(message);
}

// Precondition function that checks if the given predicate is true.
// If not, it will throw an error.
function argument(predicate: boolean, message: string): void {
    if (!predicate) {
        fail(message);
    }
}

export { fail, argument, argument as assert };
export default { fail, argument, assert: argument };
