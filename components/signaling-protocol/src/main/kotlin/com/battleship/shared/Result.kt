package com.battleship.shared

sealed class Result<out S, out F> {

    data class Success<S>(val value: S) : Result<S, Nothing>()
    data class Failure<F>(val reason: F) : Result<Nothing, F>()

    fun <T> map(transform: (S) -> T): Result<T, F> = when (this) {
        is Success -> Success(transform(value))
        is Failure -> this
    }

    fun <T> flatMap(transform: (@UnsafeVariance S) -> Result<T, @UnsafeVariance F>): Result<T, F> = when (this) {
        is Success -> transform(value)
        is Failure -> this
    }

    fun <F2> or(recover: (F) -> Result<@UnsafeVariance S, F2>): Result<S, F2> = when (this) {
        is Success -> this
        is Failure -> recover(reason)
    }

    fun tee(action: (@UnsafeVariance S) -> Unit): Result<S, F> = when (this) {
        is Success -> also { action(value) }
        is Failure -> this
    }

    fun <T> either(onSuccess: (S) -> T, onFailure: (F) -> T): T = when (this) {
        is Success -> onSuccess(value)
        is Failure -> onFailure(reason)
    }
}

fun <S> S.asSuccess(): Result<S, Nothing> = Result.Success(this)
fun <F> F.asFailure(): Result<Nothing, F> = Result.Failure(this)

inline fun <S, F> tryCatch(fn: () -> S, onError: (Throwable) -> F): Result<S, F> =
    try { fn().asSuccess() }
    catch (e: Throwable) { onError(e).asFailure() }
